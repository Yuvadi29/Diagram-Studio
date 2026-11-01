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

export class GeminiClient implements LLMClient {
  readonly provider = "gemini" as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private schemaSupported = true;

  constructor(opts: GeminiOptions) {
    if (!opts.apiKey) throw new AIError("NOT_CONFIGURED", "Cloud AI is not configured on this server (GEMINI_API_KEY is missing).");
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
      if (res.status === 404) throw new AIError("MODEL_UNAVAILABLE", `Gemini model "${this.model}" was not found. Check GEMINI_MODEL.`, { status: 404 });
      if (res.status === 401 || res.status === 403) throw new AIError("NOT_CONFIGURED", "The Gemini API key was rejected. Check GEMINI_API_KEY.", { status: res.status });
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
