import { z } from "zod";
import { assertUuid, dbError, handler, json, parseBody, requireApiUser } from "@/lib/api";
import { getDiagram } from "@/lib/data";
import { createVersion } from "@/features/diagrams/versioning";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  assertUuid(id, "diagram id");
  const { supabase } = await requireApiUser();
  const { data, error } = await supabase
    .from("diagram_versions")
    .select("id,version_number,change_description,created_at")
    .eq("diagram_id", id)
    .order("version_number", { ascending: false })
    .limit(100);
  dbError(error);
  return json({ versions: data ?? [] });
});

const CreateSchema = z.object({ description: z.string().trim().min(1).max(500) });

/** Snapshot the diagram's current saved state. */
export const POST = handler(async (request: Request, { params }: Ctx) => {
  const { id } = await params;
  assertUuid(id, "diagram id");
  const { supabase } = await requireApiUser();
  const { description } = await parseBody(request, CreateSchema, 5_000);
  const diagram = await getDiagram(supabase, id);
  const v = await createVersion(supabase, diagram, { dsl: diagram.diagram_dsl, excalidraw: diagram.excalidraw_data, description });
  return json({ version: { id: v.id, version_number: v.version_number, change_description: v.change_description, created_at: v.created_at } }, { status: 201 });
});
