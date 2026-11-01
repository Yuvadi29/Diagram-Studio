import { z } from "zod";
import { ApiError, assertUuid, dbError, handler, json, parseBody, requireApiUser } from "@/lib/api";
import { getPresentation, listScenes } from "@/lib/data";
import { PresentationFormatConfigSchema } from "@/features/presentations/formats";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  assertUuid(id, "presentation id");
  const { supabase } = await requireApiUser();
  const presentation = await getPresentation(supabase, id);
  return json({ presentation, scenes: await listScenes(supabase, id) });
});

const PatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  active_format: z.enum(["landscape", "portrait"]).optional(),
  landscape_config: PresentationFormatConfigSchema.optional(),
  portrait_config: PresentationFormatConfigSchema.optional(),
});

export const PATCH = handler(async (request: Request, { params }: Ctx) => {
  const { id } = await params;
  assertUuid(id, "presentation id");
  const { supabase } = await requireApiUser();
  const body = await parseBody(request, PatchSchema, 1_000_000);
  if (!Object.keys(body).length) throw new ApiError(400, "EMPTY_UPDATE", "Nothing to update.");
  const { data, error } = await supabase.from("presentations").update(body).eq("id", id).select("id,updated_at").single();
  dbError(error, "Presentation not found.");
  return json({ ok: true, updatedAt: data!.updated_at });
});
