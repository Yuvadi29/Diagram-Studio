import { ApiError, assertUuid, dbError, handler, json, requireApiUser } from "@/lib/api";
import type { ExportRow } from "@/lib/supabase/types";
import { withSignedUrls } from "@/lib/data/exports";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  assertUuid(id, "export id");
  const { supabase } = await requireApiUser();
  const { data, error } = await supabase.from("exports").select("*").eq("id", id).single();
  dbError(error, "Export not found.");
  const [row] = await withSignedUrls(supabase, [data as ExportRow]);
  return json({ export: row });
});

/** Cancel a queued job, or remove a finished one (and its file). */
export const DELETE = handler(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  assertUuid(id, "export id");
  const { supabase } = await requireApiUser();
  const { data, error } = await supabase.from("exports").select("*").eq("id", id).single();
  dbError(error, "Export not found.");
  const row = data as ExportRow;
  if (row.status === "queued") {
    const { error: e } = await supabase.from("exports").update({ status: "cancelled" }).eq("id", id);
    dbError(e);
    return json({ ok: true, status: "cancelled" });
  }
  if (row.status === "rendering") throw new ApiError(409, "IN_PROGRESS", "This video is rendering and can't be cancelled right now.");
  if (row.file_url) await supabase.storage.from("exports").remove([row.file_url]);
  const { error: delErr } = await supabase.from("exports").delete().eq("id", id);
  dbError(delErr);
  return json({ ok: true, status: "deleted" });
});
