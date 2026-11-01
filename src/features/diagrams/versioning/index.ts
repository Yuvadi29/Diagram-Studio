import "server-only";
import { ApiError, dbError, type ServerSupabase } from "@/lib/api";
import type { DiagramRow, DiagramVersionRow, ExcalidrawData } from "@/lib/supabase/types";
import type { DiagramDSL } from "../schema/dsl";

/**
 * Append an immutable snapshot and bump the diagram's version counter.
 * Retries once on a concurrent version-number collision.
 */
export async function createVersion(
  supabase: ServerSupabase,
  diagram: Pick<DiagramRow, "id" | "version">,
  snapshot: { dsl: DiagramDSL; excalidraw: ExcalidrawData; description: string },
): Promise<DiagramVersionRow> {
  let base = diagram.version;
  for (let attempt = 0; attempt < 3; attempt++) {
    const next = base + 1;
    const { data, error } = await supabase
      .from("diagram_versions")
      .insert({
        diagram_id: diagram.id,
        version_number: next,
        diagram_dsl: { ...snapshot.dsl, version: next },
        excalidraw_data: snapshot.excalidraw,
        change_description: snapshot.description.slice(0, 500),
      })
      .select("*")
      .single();
    if (!error) {
      const { error: upErr } = await supabase.from("diagrams").update({ version: next }).eq("id", diagram.id);
      dbError(upErr);
      return data as DiagramVersionRow;
    }
    if (error.code !== "23505") dbError(error);
    const { data: latest } = await supabase.from("diagram_versions").select("version_number").eq("diagram_id", diagram.id).order("version_number", { ascending: false }).limit(1).maybeSingle();
    base = Math.max(base + 1, (latest?.version_number as number | undefined) ?? base + 1);
  }
  throw new ApiError(409, "VERSION_CONFLICT", "Could not create a new version. Please retry.");
}
