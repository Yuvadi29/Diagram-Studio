import { assertUuid, dbError, handler, json, requireApiUser } from "@/lib/api";
import { getDiagram, readDsl } from "@/lib/data";
import { createVersion } from "@/features/diagrams/versioning";
import type { DiagramVersionRow } from "@/lib/supabase/types";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

/** Restore is non-destructive: the restored state becomes a new version. */
export const POST = handler(async (_request: Request, { params }: Ctx) => {
  const { id, versionId } = await params;
  assertUuid(id, "diagram id");
  assertUuid(versionId, "version id");
  const { supabase } = await requireApiUser();
  const { data, error } = await supabase.from("diagram_versions").select("*").eq("id", versionId).eq("diagram_id", id).single();
  dbError(error, "Version not found.");
  const v = data as DiagramVersionRow;
  const current = await getDiagram(supabase, id);
  const dsl = readDsl({ id, title: current.title, diagram_dsl: v.diagram_dsl });
  const { error: upErr } = await supabase
    .from("diagrams")
    .update({ diagram_dsl: dsl, excalidraw_data: v.excalidraw_data, diagram_type: dsl.type })
    .eq("id", id);
  dbError(upErr);
  await createVersion(supabase, current, { dsl, excalidraw: v.excalidraw_data, description: `Restored version ${v.version_number}` });
  return json({ diagram: await getDiagram(supabase, id) });
});
