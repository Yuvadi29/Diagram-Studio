import { fetchWithTimeout, sleep } from "./http";
import { AIError, type LLMClient, type LLMRequest, type LLMResponse } from "./types";

/**
 * Gemini (cloud). SERVER-SIDE ONLY: the API key is read from the environment
 * and requests are made from Next.js route handlers, never from the browser.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
  error?: { message?: string; status?: string };
}

export interface GeminiModelInfo {
  id: string;
  displayName: string;
  description?: string;
  inputTokenLimit?: number;
}

/** Rank models so the most useful ones (newest, flash before pro, no previews) come first. */
function modelRank(id: string): number[] {
  const version = Number(id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const preview = /preview|exp|experimental/i.test(id) ? 1 : 0;
  const tier = /flash-lite/.test(id) ? 2 : /flash/.test(id) ? 0 : /pro/.test(id) ? 1 : 3;
  return [preview, -version, tier];
}

export class GeminiClient implements LLMClient {
  /**
   * List the models the given key can use for generateContent. Doubles as key
   * validation: an invalid key yields NOT_CONFIGURED.
   */
  static async listModels(apiKey: string, timeoutMs = 10_000): Promise<GeminiModelInfo[]> {
    if (!apiKey.trim()) throw new AIError("NOT_CONFIGURED", "Enter a Gemini API key.");
    const res = await fetchWithTimeout(
      `${API_BASE}/models?pageSize=1000`,
      { method: "GET", headers: { "x-goog-api-key": apiKey.trim() }, timeoutMs },
      { provider: "Gemini", target: "the Gemini API" },
    );
    const data = (await res.json().catch(() => ({}))) as {
      models?: { name: string; displayName?: string; description?: string; inputTokenLimit?: number; supportedGenerationMethods?: string[] }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new AIError("NOT_CONFIGURED", "Google rejected this API key. Check that it’s a valid Gemini API key from Google AI Studio.", { status: res.status });
      }
      if (res.status === 429) throw new AIError("RATE_LIMITED", "Gemini rate limit reached. Try again shortly.", { status: 429 });
      throw new AIError("PROVIDER_ERROR", `Gemini error: ${data.error?.message ?? `HTTP ${res.status}`}`, { status: res.status });
    }
    return (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /gemini/i.test(m.name) && !/embedding|aqa|tts|image|audio|live/i.test(m.name))
      .map((m) => ({ id: m.name.replace(/^models\//, ""), displayName: m.displayName ?? m.name, description: m.description, inputTokenLimit: m.inputTokenLimit }))
      .sort((a, b) => {
        const ra = modelRank(a.id);
        const rb = modelRank(b.id);
        for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
        return a.id.localeCompare(b.id);
      });
  }

  readonly provider = "gemini" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private schemaSupported = true;

  constructor(opts: GeminiOptions) {
    if (!opts.apiKey) throw new AIError("NOT_CONFIGURED", "Add your Gemini API key in Settings → AI provider.");
    if (!opts.model) throw new AIError("NOT_CONFIGURED", "Choose a Gemini model in Settings → AI provider.");
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.maxRetries = opts.maxRetries ?? 2;
  }

  async completeJSON(req: LLMRequest): Promise<LLMResponse> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.once(req);
      } catch (err) {
        const e = err instanceof AIError ? err : new AIError("PROVIDER_ERROR", String(err), { retryable: true });
        if (!e.retryable || attempt >= this.maxRetries) throw e;
        attempt++;
        await sleep(800 * 2 ** (attempt - 1) + Math.random() * 250, req.signal);
      }
    }
  }

  private async once(req: LLMRequest): Promise<LLMResponse> {
    const generationConfig: Record<string, unknown> = {
      temperature: req.temperature ?? 0.2,
      responseMimeType: "application/json",
    };
    if (this.schemaSupported) generationConfig.responseJsonSchema = req.schema;

    const res = await fetchWithTimeout(
      `${API_BASE}/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts: [{ text: req.prompt }] }],
          generationConfig,
        }),
        timeoutMs: this.timeoutMs,
        signal: req.signal,
      },
      { provider: "Gemini", target: "the Gemini API" },
    );

    const data = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      // Older models may reject responseJsonSchema; fall back to JSON mode + prompt schema.
      if (res.status === 400 && this.schemaSupported && /schema/i.test(msg)) {
        this.schemaSupported = false;
        throw new AIError("PROVIDER_ERROR", msg, { retryable: true, status: 400 });
      }
      if (res.status === 404) throw new AIError("MODEL_UNAVAILABLE", `The Gemini model "${this.model}" isn’t available for your key. Choose another model in Settings.`, { status: 404 });
      if (res.status === 401 || res.status === 403) throw new AIError("NOT_CONFIGURED", "Google rejected your Gemini API key. Update it in Settings → AI provider.", { status: res.status });
      if (res.status === 429) throw new AIError("RATE_LIMITED", "Gemini rate limit reached. Please try again shortly.", { status: 429, retryable: true });
      throw new AIError("PROVIDER_ERROR", `Gemini error: ${msg}`, { status: res.status, retryable: res.status >= 500 });
    }
    if (data.promptFeedback?.blockReason) {
      throw new AIError("BAD_REQUEST", `Gemini declined the request (${data.promptFeedback.blockReason}).`);
    }
    const cand = data.candidates?.[0];
    const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) {
      throw new AIError("INVALID_OUTPUT", `Gemini returned no content${cand?.finishReason ? ` (${cand.finishReason})` : ""}.`, { retryable: cand?.finishReason !== "SAFETY" });
    }
    return {
      text,
      usage: { inputTokens: data.usageMetadata?.promptTokenCount, outputTokens: data.usageMetadata?.candidatesTokenCount },
      model: data.modelVersion ?? this.model,
    };
  }
}
