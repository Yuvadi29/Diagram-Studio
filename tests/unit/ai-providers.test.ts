import { beforeEach, describe, expect, it } from "vitest";
import { OllamaClient, normalizeOllamaUrl } from "@/features/ai/providers/ollama";
import { GeminiClient } from "@/features/ai/providers/gemini";
import { AIError } from "@/features/ai/providers/types";

type Handler = (url: string, init?: RequestInit) => Promise<Response> | Response;
let handler: Handler;
const calls: { url: string; body?: unknown }[] = [];

beforeEach(() => {
  calls.length = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return handler(String(url), init);
  }) as typeof fetch;
});

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const req = { system: "s", prompt: "p", schema: { type: "object" } };

describe("Ollama provider", () => {
  it("normalises endpoints", () => {
    expect(normalizeOllamaUrl("localhost:11434/")).toBe("http://localhost:11434");
    expect(normalizeOllamaUrl("")).toBe("http://localhost:11434");
  });

  it("sends structured output requests and reads usage", async () => {
    handler = () => json({ model: "llama3.1", message: { content: '{"ok":true}' }, prompt_eval_count: 12, eval_count: 7 });
    const c = new OllamaClient({ endpoint: "http://localhost:11434", model: "llama3.1" });
    const r = await c.completeJSON(req);
    expect(r.text).toBe('{"ok":true}');
    expect(r.usage).toEqual({ inputTokens: 12, outputTokens: 7 });
    expect(calls[0].url).toBe("http://localhost:11434/api/chat");
    expect((calls[0].body as { format: unknown }).format).toEqual({ type: "object" });
    expect((calls[0].body as { stream: boolean }).stream).toBe(false);
  });

  it("explains connection failures (no silent fallback)", async () => {
    handler = () => {
      throw new TypeError("Failed to fetch");
    };
    const c = new OllamaClient({ model: "llama3.1" });
    await expect(c.completeJSON(req)).rejects.toThrow(/Could not reach Ollama/);
    const t = await OllamaClient.testConnection("http://localhost:11434");
    expect(t.ok).toBe(false);
    expect(t.error).toMatch(/Could not reach Ollama/);
  });

  it("reports missing models", async () => {
    handler = () => json({ error: 'model "qwen" not found, try pulling it first' }, 404);
    const c = new OllamaClient({ model: "qwen" });
    try {
      await c.completeJSON(req);
      throw new Error("should fail");
    } catch (e) {
      expect((e as AIError).code).toBe("MODEL_UNAVAILABLE");
      expect((e as AIError).message).toContain("ollama pull qwen");
    }
  });

  it("checks model availability and tests connections", async () => {
    handler = (url) => (url.endsWith("/api/version") ? json({ version: "0.12.0" }) : json({ models: [{ name: "llama3.1:latest" }, { name: "qwen2.5:7b" }] }));
    const t = await OllamaClient.testConnection("localhost:11434");
    expect(t).toMatchObject({ ok: true, version: "0.12.0" });
    expect(t.models.map((m) => m.name)).toEqual(["llama3.1:latest", "qwen2.5:7b"]);
    await new OllamaClient({ model: "llama3.1" }).checkModel();
    await expect(new OllamaClient({ model: "mistral" }).checkModel()).rejects.toThrow(/not installed/);
  });

  it("times out", async () => {
    handler = (_u, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    const c = new OllamaClient({ model: "m", timeoutMs: 30 });
    await expect(c.completeJSON(req)).rejects.toThrow(/did not respond/);
  });
});

describe("Gemini provider", () => {
  it("requires an API key", () => {
    expect(() => new GeminiClient({ apiKey: "", model: "m" })).toThrow(/GEMINI_API_KEY/);
  });

  it("calls generateContent with JSON mode, schema and key header", async () => {
    handler = () => json({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }], usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 9 } });
    const c = new GeminiClient({ apiKey: "k", model: "gemini-test" });
    const r = await c.completeJSON(req);
    expect(r.usage).toEqual({ inputTokens: 30, outputTokens: 9 });
    expect(calls[0].url).toContain("/models/gemini-test:generateContent");
    const body = calls[0].body as { generationConfig: Record<string, unknown>; systemInstruction: unknown };
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema).toEqual({ type: "object" });
  });

  it("retries recoverable failures", async () => {
    let n = 0;
    handler = () => (++n < 2 ? json({ error: { message: "overloaded" } }, 503) : json({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }));
    const r = await new GeminiClient({ apiKey: "k", model: "m", maxRetries: 2 }).completeJSON(req);
    expect(r.text).toBe("{}");
    expect(n).toBe(2);
  });

  it("does not retry auth errors", async () => {
    let n = 0;
    handler = () => {
      n++;
      return json({ error: { message: "bad key" } }, 403);
    };
    await expect(new GeminiClient({ apiKey: "k", model: "m" }).completeJSON(req)).rejects.toThrow(/rejected/);
    expect(n).toBe(1);
  });

  it("falls back to plain JSON mode when the schema is rejected", async () => {
    let n = 0;
    handler = () => (++n === 1 ? json({ error: { message: "Invalid JSON payload: responseJsonSchema unknown" } }, 400) : json({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }));
    await new GeminiClient({ apiKey: "k", model: "m" }).completeJSON(req);
    expect((calls[1].body as { generationConfig: Record<string, unknown> }).generationConfig.responseJsonSchema).toBeUndefined();
  });
});
