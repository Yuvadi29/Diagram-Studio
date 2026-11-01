import "server-only";
import { ApiError, dbError, type ServerSupabase } from "@/lib/api";
import { decryptSecret, encryptSecret, isEncryptionConfigured, secretHint } from "@/lib/crypto";
import { serverEnv } from "@/lib/server-env";
import { createDiagramAI } from "../orchestrator/diagram-ai";
import { GeminiClient } from "../providers/gemini";
import { AI_ERROR_HTTP_STATUS, AIError, type AIProvider, type AIProviderId, type TokenUsage } from "../providers/types";

export type AIOperation = "generate" | "refine" | "scenes";

export type { CloudStatus } from "./settings";
import type { CloudStatus } from "./settings";

async function readModel(supabase: ServerSupabase, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("preferences").eq("id", userId).maybeSingle();
  const m = (data?.preferences as { geminiModel?: unknown } | undefined)?.geminiModel;
  return typeof m === "string" && m.trim() ? m.trim() : null;
}

export async function getCloudStatus(supabase: ServerSupabase, userId: string): Promise<CloudStatus> {
  const [{ data }, model] = await Promise.all([
    supabase.from("user_ai_keys").select("key_hint").eq("user_id", userId).eq("provider", "gemini").maybeSingle(),
    readModel(supabase, userId),
  ]);
  const hasKey = Boolean(data);
  return { configured: hasKey && Boolean(model), hasKey, keyHint: (data?.key_hint as string | null) ?? null, model, storageReady: isEncryptionConfigured() };
}

/** The user's own decrypted Gemini key, or null. Server-side only. */
export async function getUserGeminiKey(supabase: ServerSupabase, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("user_ai_keys").select("encrypted_key").eq("user_id", userId).eq("provider", "gemini").maybeSingle();
  dbError(error);
  if (!data) return null;
  try {
    return decryptSecret(data.encrypted_key as string);
  } catch {
    throw new ApiError(409, "NOT_CONFIGURED", "Your saved Gemini API key can’t be read (the server’s encryption secret changed). Please add your key again in Settings.");
  }
}

export async function saveUserGeminiKey(supabase: ServerSupabase, userId: string, apiKey: string) {
  if (!isEncryptionConfigured()) {
    throw new ApiError(503, "STORAGE_NOT_READY", "This server can’t store API keys yet: API_KEY_ENCRYPTION_SECRET is not set. See README → Cloud AI.");
  }
  const { error } = await supabase
    .from("user_ai_keys")
    .upsert({ user_id: userId, provider: "gemini", encrypted_key: encryptSecret(apiKey.trim()), key_hint: secretHint(apiKey) }, { onConflict: "user_id,provider" });
  dbError(error);
}

export async function deleteUserGeminiKey(supabase: ServerSupabase, userId: string) {
  const { error } = await supabase.from("user_ai_keys").delete().eq("user_id", userId).eq("provider", "gemini");
  dbError(error);
}

export async function saveGeminiModel(supabase: ServerSupabase, userId: string, model: string | null) {
  const { data: cur } = await supabase.from("profiles").select("preferences").eq("id", userId).maybeSingle();
  const preferences = { ...((cur?.preferences as Record<string, unknown>) ?? {}), geminiModel: model ?? undefined };
  const { error } = await supabase.from("profiles").upsert({ id: userId, preferences }, { onConflict: "id" });
  dbError(error);
}

/** Cloud provider (Gemini) using the signed-in user's own key and chosen model. */
export async function getCloudAI(supabase: ServerSupabase, userId: string): Promise<{ ai: AIProvider; model: string }> {
  const [apiKey, model] = await Promise.all([getUserGeminiKey(supabase, userId), readModel(supabase, userId)]);
  if (!apiKey) throw new AIError("NOT_CONFIGURED", "Add your Gemini API key in Settings → AI provider to use cloud AI, or switch to local Ollama.");
  if (!model) throw new AIError("NOT_CONFIGURED", "Choose a Gemini model in Settings → AI provider.");
  return { ai: createDiagramAI(new GeminiClient({ apiKey, model, timeoutMs: serverEnv.geminiTimeoutMs })), model };
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
    throw new ApiError(429, "RATE_LIMITED", `You've reached the limit of ${serverEnv.rateLimitPer10Min} cloud AI requests per 10 minutes. Try again in a few minutes.`);
  }
  if ((cDay ?? 0) >= serverEnv.rateLimitPerDay) {
    throw new ApiError(429, "RATE_LIMITED", `You've reached today's limit of ${serverEnv.rateLimitPerDay} cloud AI requests. Try again tomorrow, or use local Ollama.`);
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

/** Run a cloud AI operation with the user's key, rate limiting and usage logging. */
export async function runCloudOperation<T>(
  supabase: ServerSupabase,
  userId: string,
  operation: AIOperation,
  fn: (ai: AIProvider, signal: AbortSignal) => Promise<{ usage: TokenUsage; model: string } & T>,
  signal: AbortSignal,
): Promise<T> {
  let model = "unknown";
  try {
    const cloud = await getCloudAI(supabase, userId);
    model = cloud.model;
    await checkRateLimit(supabase, userId);
    const result = await fn(cloud.ai, signal);
    await logUsage(supabase, { userId, provider: "gemini", model: result.model, operation, usage: result.usage, status: "success" });
    return result;
  } catch (err) {
    const code = err instanceof AIError ? err.code : err instanceof ApiError ? err.code : "UNKNOWN";
    // Missing configuration isn't a request worth counting against limits.
    if (code !== "NOT_CONFIGURED" && code !== "RATE_LIMITED") {
      await logUsage(supabase, { userId, provider: "gemini", model, operation, status: "error", errorCode: code });
    }
    throw toApiError(err);
  }
}
