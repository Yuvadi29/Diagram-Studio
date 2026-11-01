import { z } from "zod";
import { assertUuid, dbError, handler, json, parseBody, requireApiUser, uuidSchema } from "@/lib/api";
import { listScenes } from "@/lib/data";
import { ScenesArraySchema } from "@/features/presentations/scenes/schema";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  assertUuid(id, "presentation id");
  const { supabase } = await requireApiUser();
  return json({ scenes: await listScenes(supabase, id) });
});

const PutSchema = z.object({ scenes: ScenesArraySchema });

/** Replace the full, ordered scene list atomically. */
export const PUT = handler(async (request: Request, { params }: Ctx) => {
  const { id } = await params;
  assertUuid(id, "presentation id");
  const { supabase } = await requireApiUser();
  const { scenes } = await parseBody(request, PutSchema, 2_000_000);
  const seen = new Set<string>();
  const normalized = [...scenes]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => {
      let sid = uuidSchema.safeParse(s.id).success ? s.id : crypto.randomUUID();
      if (seen.has(sid)) sid = crypto.randomUUID();
      seen.add(sid);
      return { ...s, id: sid, order: i };
    });
  const { error } = await supabase.rpc("replace_scenes", { p_presentation_id: id, p_scenes: normalized });
  dbError(error, "Presentation not found.");
  return json({ scenes: normalized });
});
