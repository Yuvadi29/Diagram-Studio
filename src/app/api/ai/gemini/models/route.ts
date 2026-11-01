import { z } from "zod";
import { ApiError, handler, json, parseBody, requireApiUser } from "@/lib/api";
import { getUserGeminiKey, toApiError } from "@/features/ai/services/server";
import { GeminiClient } from "@/features/ai/providers/gemini";

const Schema = z.object({ apiKey: z.string().trim().min(10).max(500).optional() });

/**
 * List the Gemini models available to a key: the one just typed in (to verify it
 * before saving) or the user's saved key. The key is only used server-side.
 */
export const POST = handler(async (request: Request) => {
  const { supabase, user } = await requireApiUser();
  const { apiKey } = await parseBody(request, Schema, 2_000);
  const key = apiKey ?? (await getUserGeminiKey(supabase, user.id));
  if (!key) throw new ApiError(400, "NOT_CONFIGURED", "Add your Gemini API key first.");
  try {
    return json({ models: await GeminiClient.listModels(key) });
  } catch (err) {
    throw toApiError(err);
  }
});
