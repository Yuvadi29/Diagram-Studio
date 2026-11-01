import { z } from "zod";
import { dbError, handler, json, parseBody, requireApiUser } from "@/lib/api";

export const GET = handler(async () => {
  const { supabase, user } = await requireApiUser();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  dbError(error);
  return json({ profile: data, email: user.email });
});

const PatchSchema = z.object({
  display_name: z.string().trim().max(80).nullable().optional(),
  avatar_url: z.string().trim().url().max(2048).nullable().optional().or(z.literal("").transform(() => null)),
  preferences: z
    .object({
      provider: z.enum(["gemini", "ollama"]).optional(),
      ollamaUrl: z.string().trim().max(300).optional(),
      ollamaModel: z.string().trim().max(200).optional(),
      theme: z.enum(["dark", "light"]).optional(),
    })
    .optional(),
});

export const PATCH = handler(async (request: Request) => {
  const { supabase, user } = await requireApiUser();
  const body = await parseBody(request, PatchSchema, 10_000);
  const update: Record<string, unknown> = {};
  if (body.display_name !== undefined) update.display_name = body.display_name || null;
  if (body.avatar_url !== undefined) update.avatar_url = body.avatar_url || null;
  if (body.preferences) {
    const { data: cur } = await supabase.from("profiles").select("preferences").eq("id", user.id).maybeSingle();
    update.preferences = { ...((cur?.preferences as object) ?? {}), ...body.preferences };
  }
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, email: user.email, ...update }, { onConflict: "id" })
    .select("*")
    .single();
  dbError(error);
  return json({ profile: data });
});
