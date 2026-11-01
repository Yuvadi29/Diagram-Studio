import { z } from "zod";
import { ApiError, assertUuid, dbError, handler, json, parseBody, requireApiUser } from "@/lib/api";
import { withSignedUrls } from "@/lib/data/exports";
import type { ExportRow } from "@/lib/supabase/types";

export const GET = handler(async (request: Request) => {
  const { supabase } = await requireApiUser();
  const presentationId = new URL(request.url).searchParams.get("presentationId");
  let q = supabase.from("exports").select("*").order("created_at", { ascending: false }).limit(20);
  if (presentationId) {
    assertUuid(presentationId, "presentation id");
    q = q.eq("presentation_id", presentationId);
  }
  const { data, error } = await q;
  dbError(error);
  return json({ exports: await withSignedUrls(supabase, (data ?? []) as ExportRow[]) });
});

const CreateSchema = z.object({
  presentationId: z.string().uuid(),
  format: z.enum(["mp4-landscape", "mp4-portrait"]),
});

/**
 * Queue a video render. Rendering never runs inside this request: the
 * background worker (`bun run worker:render`) claims queued jobs.
 */
export const POST = handler(async (request: Request) => {
  const { supabase } = await requireApiUser();
  const body = await parseBody(request, CreateSchema, 2_000);
  const { data: pres, error } = await supabase.from("presentations").select("id,project_id").eq("id", body.presentationId).single();
  dbError(error, "Presentation not found.");
  const { count } = await supabase.from("scenes").select("id", { count: "exact", head: true }).eq("presentation_id", body.presentationId);
  if (!count) throw new ApiError(400, "NO_SCENES", "Add at least one scene before exporting a video.");
  const { count: active } = await supabase.from("exports").select("id", { count: "exact", head: true }).in("status", ["queued", "rendering"]);
  if ((active ?? 0) >= 3) throw new ApiError(429, "TOO_MANY_EXPORTS", "You already have 3 videos rendering. Wait for one to finish.");
  const { data, error: insErr } = await supabase
    .from("exports")
    .insert({ project_id: pres!.project_id, presentation_id: pres!.id, format: body.format, status: "queued" })
    .select("*")
    .single();
  dbError(insErr);
  return json({ export: { ...(data as ExportRow), download_url: null } }, { status: 201 });
});
