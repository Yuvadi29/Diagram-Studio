import "server-only";
import { ApiError, type ServerSupabase } from "@/lib/api";
import { serverEnv } from "@/lib/server-env";
import { createDiagramAI } from "../orchestrator/diagram-ai";
import { GeminiClient } from "../providers/gemini";
import { AI_ERROR_HTTP_STATUS, AIError, type AIProvider, type AIProviderId, type TokenUsage } from "../providers/types";

export type AIOperation = "generate" | "refine" | "scenes";

export function cloudStatus() {
  return { configured: Boolean(serverEnv.geminiApiKey), provider: "gemini" as const, model: serverEnv.geminiModel };
}

/** Server-side cloud provider (Gemini). The API key never leaves the server. */
export function getCloudAI(): AIProvider {
  if (!serverEnv.geminiApiKey) {
    throw new AIError("NOT_CONFIGURED", "Cloud AI is not configured on this server. Ask the administrator to set GEMINI_API_KEY, or switch to local Ollama in Settings.");
  }
  return createDiagramAI(new GeminiClient({ apiKey: serverEnv.geminiApiKey, model: serverEnv.geminiModel, timeoutMs: serverEnv.geminiTimeoutMs }));
}

/** Per-user rate limits backed by the ai_usage table (works across serverless instances). */
export async function checkRateLimit(supabase: ServerSupabase, userId: string) {
  const since10 = new Date(Date.now() - 10 * 60_000).toISOString();
  const sinceDay = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [{ count: c10 }, { count: cDay }] = await Promise.all([
    supabase.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("provider", "gemini").gte("created_at", since10),
    supabase.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("provider", "gemini").gte("created_at", sinceDay),
  ]);
  if ((c10 ?? 0) >= serverEnv.rateLimitPer10Min) {
    throw new ApiError(429, "RATE_LIMITED", `You've reached the cloud AI limit (${serverEnv.rateLimitPer10Min} requests per 10 minutes). Try again in a few minutes, or use local Ollama.`);
  }
  if ((cDay ?? 0) >= serverEnv.rateLimitPerDay) {
    throw new ApiError(429, "RATE_LIMITED", `You've reached today's cloud AI limit (${serverEnv.rateLimitPerDay} requests). Try again tomorrow, or use local Ollama.`);
  }
}

export async function logUsage(
  supabase: ServerSupabase,
  row: { userId: string; provider: AIProviderId; model: string; operation: AIOperation; usage?: TokenUsage; status: "success" | "error"; errorCode?: string },
) {
  const { error } = await supabase.from("ai_usage").insert({
    user_id: row.userId,
    provider: row.provider,
    model: row.model.slice(0, 200),
    operation: row.operation,
    input_tokens: row.usage?.inputTokens ?? null,
    output_tokens: row.usage?.outputTokens ?? null,
    status: row.status,
    error_code: row.errorCode ?? null,
  });
  if (error) console.error("[ai] failed to log usage", error.message);
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof AIError) return new ApiError(AI_ERROR_HTTP_STATUS[err.code], err.code, err.message);
  return new ApiError(500, "AI_FAILED", "The AI request failed unexpectedly.");
}

/** Run a cloud AI operation with auth'd rate limiting and usage logging. */
export async function runCloudOperation<T>(
  supabase: ServerSupabase,
  userId: string,
  operation: AIOperation,
  fn: (ai: AIProvider, signal: AbortSignal) => Promise<{ usage: TokenUsage; model: string } & T>,
  signal: AbortSignal,
): Promise<T> {
  await checkRateLimit(supabase, userId);
  const ai = getCloudAI();
  try {
    const result = await fn(ai, signal);
    await logUsage(supabase, { userId, provider: "gemini", model: result.model, operation, usage: result.usage, status: "success" });
    return result;
  } catch (err) {
    const code = err instanceof AIError ? err.code : err instanceof ApiError ? err.code : "UNKNOWN";
    await logUsage(supabase, { userId, provider: "gemini", model: serverEnv.geminiModel, operation, status: "error", errorCode: code });
    throw toApiError(err);
  }
}
