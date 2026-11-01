import "server-only";

/**
 * Server-only configuration. Never import this from client components.
 * There is deliberately no app-wide Gemini key: every user brings their own
 * (stored encrypted in `user_ai_keys`).
 */
export const serverEnv = {
  geminiTimeoutMs: Number(process.env.GEMINI_TIMEOUT_MS ?? 60000) || 60000,
  rateLimitPer10Min: Number(process.env.AI_RATE_LIMIT_PER_10_MIN ?? 60) || 60,
  rateLimitPerDay: Number(process.env.AI_RATE_LIMIT_PER_DAY ?? 1000) || 1000,
};
