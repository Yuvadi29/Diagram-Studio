import "server-only";

/** Server-only configuration. Never import this from client components. */
export const serverEnv = {
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  geminiTimeoutMs: Number(process.env.GEMINI_TIMEOUT_MS ?? 60000) || 60000,
  rateLimitPer10Min: Number(process.env.AI_RATE_LIMIT_PER_10_MIN ?? 30) || 30,
  rateLimitPerDay: Number(process.env.AI_RATE_LIMIT_PER_DAY ?? 300) || 300,
};
