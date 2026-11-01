import { fetchWithTimeout } from "./http";
import { AIError, type LLMClient, type LLMRequest, type LLMResponse } from "./types";

/**
 * Ollama (local inference).
 *
 * This client runs IN THE USER'S BROWSER and talks directly to the Ollama
 * server on their own machine (default http://localhost:11434). A deployed
 * server can never reach a visitor's localhost, so it never proxies these
 * calls. Ollama must allow the app's origin, e.g.
 *   OLLAMA_ORIGINS="https://your-app.example.com" ollama serve
 */

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

export function normalizeOllamaUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_OLLAMA_URL;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function originHint(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function connectionHelp(endpoint: string): string {
  const origin = originHint();
  return (
    `Could not reach Ollama at ${endpoint}. Make sure Ollama is running` +
    (origin ? ` and allows this site: set OLLAMA_ORIGINS="${origin}" and restart Ollama.` : ".")
  );
}

export interface OllamaModelInfo {
  name: string;
  size?: number;
  modifiedAt?: string;
  family?: string;
  parameterSize?: string;
}

export interface OllamaConnectionResult {
  ok: boolean;
  version?: string;
  models: OllamaModelInfo[];
  error?: string;
}

export class OllamaClient implements LLMClient {
  readonly provider = "ollama" as const;
  readonly endpoint: string;
  readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts: { endpoint?: string; model: string; timeoutMs?: number }) {
    this.endpoint = normalizeOllamaUrl(opts.endpoint ?? DEFAULT_OLLAMA_URL);
    this.model = opts.model.trim();
    this.timeoutMs = opts.timeoutMs ?? 180_000;
  }

  static async listModels(endpoint: string, timeoutMs = 5000): Promise<OllamaModelInfo[]> {
    const base = normalizeOllamaUrl(endpoint);
    let res: Response;
    try {
      res = await fetchWithTimeout(`${base}/api/tags`, { method: "GET", timeoutMs }, { provider: "Ollama", target: base });
    } catch (err) {
      if (err instanceof AIError && err.code === "CONNECTION_FAILED") throw new AIError("CONNECTION_FAILED", connectionHelp(base), { cause: err });
      throw err;
    }
    if (!res.ok) throw new AIError("PROVIDER_ERROR", `Ollama returned HTTP ${res.status} when listing models.`, { status: res.status });
    const data = (await res.json()) as { models?: { name: string; size?: number; modified_at?: string; details?: { family?: string; parameter_size?: string } }[] };
    return (data.models ?? []).map((m) => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
      family: m.details?.family,
      parameterSize: m.details?.parameter_size,
    }));
  }

  /** Connection test: version + installed models. Never throws. */
  static async testConnection(endpoint: string): Promise<OllamaConnectionResult> {
    const base = normalizeOllamaUrl(endpoint);
    try {
      const res = await fetchWithTimeout(`${base}/api/version`, { method: "GET", timeoutMs: 4000 }, { provider: "Ollama", target: base });
      if (!res.ok) return { ok: false, models: [], error: `Ollama responded with HTTP ${res.status}.` };
      const { version } = (await res.json()) as { version?: string };
      const models = await OllamaClient.listModels(base);
      return { ok: true, version, models };
    } catch (err) {
      const message = err instanceof AIError && err.code === "CONNECTION_FAILED" ? connectionHelp(base) : err instanceof Error ? err.message : String(err);
      return { ok: false, models: [], error: message };
    }
  }

  /** Check that the configured model is installed. */
  async checkModel(): Promise<void> {
    const models = await OllamaClient.listModels(this.endpoint);
    const want = this.model.includes(":") ? this.model : `${this.model}:latest`;
    if (!models.some((m) => m.name === this.model || m.name === want)) {
      throw new AIError(
        "MODEL_UNAVAILABLE",
        `The model "${this.model}" is not installed in Ollama. Run \`ollama pull ${this.model}\` or pick an installed model in Settings.`,
      );
    }
  }

  async completeJSON(req: LLMRequest): Promise<LLMResponse> {
    if (!this.model) throw new AIError("NOT_CONFIGURED", "Choose an Ollama model in Settings first.");
    const res = await fetchWithTimeout(
      `${this.endpoint}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: req.schema,
          options: { temperature: req.temperature ?? 0.2 },
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.prompt },
          ],
        }),
        timeoutMs: this.timeoutMs,
        signal: req.signal,
      },
      { provider: "Ollama", target: this.endpoint },
    ).catch((err) => {
      if (err instanceof AIError && err.code === "CONNECTION_FAILED") throw new AIError("CONNECTION_FAILED", connectionHelp(this.endpoint), { cause: err });
      throw err;
    });

    if (!res.ok) {
      let detail = "";
      try {
        detail = ((await res.json()) as { error?: string }).error ?? "";
      } catch {
        /* ignore */
      }
      if (res.status === 404 || /not found|pull/i.test(detail)) {
        throw new AIError(
          "MODEL_UNAVAILABLE",
          `The model "${this.model}" is not available in Ollama. Run \`ollama pull ${this.model}\` or pick another model in Settings.`,
          { status: res.status },
        );
      }
      throw new AIError("PROVIDER_ERROR", `Ollama error (HTTP ${res.status})${detail ? `: ${detail}` : ""}`, { status: res.status, retryable: res.status >= 500 });
    }
    const data = (await res.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number; model?: string };
    const text = data.message?.content ?? "";
    if (!text.trim()) throw new AIError("INVALID_OUTPUT", "Ollama returned an empty response.");
    return { text, usage: { inputTokens: data.prompt_eval_count, outputTokens: data.eval_count }, model: data.model ?? this.model };
  }
}
