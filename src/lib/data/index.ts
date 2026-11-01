import "server-only";
import { ApiError, dbError, type ServerSupabase } from "@/lib/api";
import type { DiagramRow, PresentationRow, ProjectRow, SceneRow } from "@/lib/supabase/types";
import { normalizeFormats } from "@/features/presentations/formats";
import { PresentationSceneSchema, type PresentationScene } from "@/features/presentations/scenes/schema";
import { createEmptyDiagram, type DiagramDSL } from "@/features/diagrams/schema/dsl";
import { repairAndValidate } from "@/features/diagrams/validation/sanitize";

export const PROJECT_LIST_COLUMNS = "id,user_id,title,description,thumbnail_url,created_at,updated_at";

export async function listProjects(supabase: ServerSupabase, q?: string): Promise<ProjectRow[]> {
  let query = supabase.from("projects").select(PROJECT_LIST_COLUMNS).order("updated_at", { ascending: false }).limit(120);
  if (q?.trim()) query = query.ilike("title", `%${q.trim().replace(/[%_]/g, "\\$&")}%`);
  const { data, error } = await query;
  dbError(error);
  return (data ?? []) as ProjectRow[];
}

export async function getProject(supabase: ServerSupabase, id: string): Promise<ProjectRow> {
  const { data, error } = await supabase.from("projects").select(PROJECT_LIST_COLUMNS).eq("id", id).single();
  dbError(error, "Project not found.");
  return data as ProjectRow;
}

/** The DSL stored in the database, validated (never trust stored JSON blindly). */
export function readDsl(row: Pick<DiagramRow, "id" | "title" | "diagram_dsl">): DiagramDSL {
  const r = repairAndValidate(row.diagram_dsl, { fallbackId: row.id, fallbackTitle: row.title });
  return r.success ? { ...r.diagram, id: row.id } : createEmptyDiagram(row.id, row.title);
}

export async function getDiagramForProject(supabase: ServerSupabase, projectId: string): Promise<DiagramRow> {
  const { data, error } = await supabase.from("diagrams").select("*").eq("project_id", projectId).order("created_at").limit(1).maybeSingle();
  dbError(error);
  if (!data) throw new ApiError(404, "NOT_FOUND", "Diagram not found.");
  const row = data as DiagramRow;
  return { ...row, diagram_dsl: readDsl(row) };
}

export async function getDiagram(supabase: ServerSupabase, id: string): Promise<DiagramRow> {
  const { data, error } = await supabase.from("diagrams").select("*").eq("id", id).single();
  dbError(error, "Diagram not found.");
  const row = data as DiagramRow;
  return { ...row, diagram_dsl: readDsl(row) };
}

export async function getPresentationForProject(supabase: ServerSupabase, projectId: string): Promise<PresentationRow> {
  const { data, error } = await supabase.from("presentations").select("*").eq("project_id", projectId).order("created_at").limit(1).maybeSingle();
  dbError(error);
  if (data) return normalizePresentation(data as PresentationRow);
  // Older projects without a presentation get one lazily.
  const { data: created, error: insertError } = await supabase.from("presentations").insert({ project_id: projectId }).select("*").single();
  dbError(insertError);
  return normalizePresentation(created as PresentationRow);
}

export async function getPresentation(supabase: ServerSupabase, id: string): Promise<PresentationRow> {
  const { data, error } = await supabase.from("presentations").select("*").eq("id", id).single();
  dbError(error, "Presentation not found.");
  return normalizePresentation(data as PresentationRow);
}

function normalizePresentation(row: PresentationRow): PresentationRow {
  const f = normalizeFormats({ landscape: row.landscape_config, portrait: row.portrait_config });
  return { ...row, landscape_config: f.landscape, portrait_config: f.portrait };
}

export async function listScenes(supabase: ServerSupabase, presentationId: string): Promise<PresentationScene[]> {
  const { data, error } = await supabase.from("scenes").select("*").eq("presentation_id", presentationId).order("order_index");
  dbError(error);
  const scenes: PresentationScene[] = [];
  for (const row of (data ?? []) as SceneRow[]) {
    const parsed = PresentationSceneSchema.safeParse({ ...row.scene_data, id: row.id, title: row.title, order: row.order_index, description: row.description ?? undefined });
    if (parsed.success) scenes.push(parsed.data);
  }
  return scenes;
}
