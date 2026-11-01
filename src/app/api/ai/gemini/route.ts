import { z } from "zod";
import { ApiError, handler, json, parseBody, requireApiUser } from "@/lib/api";
import { deleteUserGeminiKey, getCloudStatus, getUserGeminiKey, saveGeminiModel, saveUserGeminiKey, toApiError } from "@/features/ai/services/server";
import { GeminiClient } from "@/features/ai/providers/gemini";

/** The signed-in user's Gemini setup (never includes the key itself). */
export const GET = handler(async () => {
  const { supabase, user } = await requireApiUser();
  return json({ cloud: await getCloudStatus(supabase, user.id) });
});

const PutSchema = z.object({
  /** A new key to store. Omit to keep the saved key and only change the model. */
  apiKey: z.string().trim().min(10, "That doesn’t look like a Gemini API key.").max(500).optional(),
  model: z.string().trim().min(1, "Choose a model.").max(200),
});

/** Save the user's own key (verified against Google first) and chosen model. */
export const PUT = handler(async (request: Request) => {
  const { supabase, user } = await requireApiUser();
  const body = await parseBody(request, PutSchema, 5_000);
  const key = body.apiKey ?? (await getUserGeminiKey(supabase, user.id));
  if (!key) throw new ApiError(400, "NOT_CONFIGURED", "Add your Gemini API key first.");
  let models;
  try {
    models = await GeminiClient.listModels(key);
  } catch (err) {
    throw toApiError(err);
  }
  if (!models.some((m) => m.id === body.model)) {
    throw new ApiError(400, "MODEL_UNAVAILABLE", `“${body.model}” isn’t available for this API key. Pick one from the list.`);
  }
  if (body.apiKey) await saveUserGeminiKey(supabase, user.id, body.apiKey);
  await saveGeminiModel(supabase, user.id, body.model);
  return json({ cloud: await getCloudStatus(supabase, user.id) });
});

/** Remove the user's stored key. */
export const DELETE = handler(async () => {
  const { supabase, user } = await requireApiUser();
  await deleteUserGeminiKey(supabase, user.id);
  return json({ cloud: await getCloudStatus(supabase, user.id) });
});
