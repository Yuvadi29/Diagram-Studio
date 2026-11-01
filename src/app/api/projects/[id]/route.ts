import { z } from "zod";
import { ApiError, assertUuid, dbError, handler, json, parseBody, requireApiUser } from "@/lib/api";
import { getDiagramForProject, getPresentationForProject, getProject } from "@/lib/data";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  assertUuid(id, "project id");
  const { supabase } = await requireApiUser();
  const project = await getProject(supabase, id);
  const diagram = await getDiagramForProject(supabase, id);
  const presentation = await getPresentationForProject(supabase, id);
  return json({ project, diagram, presentation });
});

const PatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
});

export const PATCH = handler(async (request: Request, { params }: Ctx) => {
  const { id } = await params;
  assertUuid(id, "project id");
  const { supabase } = await requireApiUser();
  const body = await parseBody(request, PatchSchema, 10_000);
  if (!Object.keys(body).length) throw new ApiError(400, "EMPTY_UPDATE", "Nothing to update.");
  const { data, error } = await supabase.from("projects").update(body).eq("id", id).select("id,title,description,updated_at").single();
  dbError(error, "Project not found.");
  if (body.title) {
    await supabase.from("diagrams").update({ title: body.title }).eq("project_id", id);
    await supabase.from("presentations").update({ title: body.title }).eq("project_id", id);
  }
  return json({ project: data });
});

export const DELETE = handler(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  assertUuid(id, "project id");
  const { supabase } = await requireApiUser();
  const { data, error } = await supabase.from("projects").delete().eq("id", id).select("id");
  dbError(error);
  if (!data?.length) throw new ApiError(404, "NOT_FOUND", "Project not found.");
  return json({ ok: true });
});
