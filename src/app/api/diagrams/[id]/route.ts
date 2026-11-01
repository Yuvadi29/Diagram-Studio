import { z } from "zod";
import { ApiError, assertUuid, dbError, handler, json, parseBody, requireApiUser } from "@/lib/api";
import { getDiagram } from "@/lib/data";
import { repairAndValidate } from "@/features/diagrams/validation/sanitize";
import { createVersion } from "@/features/diagrams/versioning";
import type { DiagramVersionRow } from "@/lib/supabase/types";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  assertUuid(id, "diagram id");
  const { supabase } = await requireApiUser();
  return json({ diagram: await getDiagram(supabase, id) });
});

const SaveSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  dsl: z.unknown(),
  excalidraw: z.object({
    elements: z.array(z.record(z.string(), z.unknown())).max(20_000),
    appState: z.record(z.string(), z.unknown()).optional(),
    files: z.record(z.string(), z.unknown()).optional(),
  }),
  thumbnail: z
    .string()
    .max(300_000)
    .regex(/^data:image\/(png|webp|jpeg);base64,/)
    .nullable()
    .optional(),
  createVersion: z.object({ description: z.string().trim().min(1).max(500) }).optional(),
  /** Optimistic concurrency: reject when the server copy is newer than what the client loaded. */
  baseUpdatedAt: z.string().optional(),
});

export const PUT = handler(async (request: Request, { params }: Ctx) => {
  const { id } = await params;
  assertUuid(id, "diagram id");
  const { supabase } = await requireApiUser();
  const body = await parseBody(request, SaveSchema, 8_000_000);

  const { data: current, error: curErr } = await supabase.from("diagrams").select("id,project_id,version,updated_at,title").eq("id", id).single();
  dbError(curErr, "Diagram not found.");
  if (body.baseUpdatedAt && current && new Date(current.updated_at).getTime() > new Date(body.baseUpdatedAt).getTime() + 1000) {
    throw new ApiError(409, "STALE_WRITE", "This diagram was changed in another tab or device. Reload to get the latest version.");
  }

  const dsl = repairAndValidate(body.dsl, { fallbackId: id, fallbackTitle: body.title ?? current!.title });
  if (!dsl.success) throw new ApiError(400, "INVALID_DIAGRAM", "The diagram structure is invalid.", dsl.errors);
  const appState = body.excalidraw.appState ?? {};
  const excalidraw = {
    elements: body.excalidraw.elements,
    appState: {
      viewBackgroundColor: typeof appState.viewBackgroundColor === "string" ? appState.viewBackgroundColor : undefined,
      gridSize: typeof appState.gridSize === "number" ? appState.gridSize : null,
    },
    files: body.excalidraw.files ?? {},
  };
  const title = body.title ?? current!.title;
  const update: Record<string, unknown> = {
    title,
    diagram_type: dsl.diagram.type,
    diagram_dsl: { ...dsl.diagram, id, title },
    excalidraw_data: excalidraw,
  };
  const { data: saved, error } = await supabase.from("diagrams").update(update).eq("id", id).select("id,version,updated_at").single();
  dbError(error, "Diagram not found.");

  const projectUpdate: Record<string, unknown> = { title };
  if (body.thumbnail !== undefined) projectUpdate.thumbnail_url = body.thumbnail;
  await supabase.from("projects").update(projectUpdate).eq("id", current!.project_id);

  let version: DiagramVersionRow | null = null;
  if (body.createVersion) {
    version = await createVersion(supabase, { id, version: saved!.version }, {
      dsl: { ...dsl.diagram, id, title },
      excalidraw,
      description: body.createVersion.description,
    });
  }
  const { data: fresh } = await supabase.from("diagrams").select("version,updated_at").eq("id", id).single();
  return json({ ok: true, version: fresh?.version ?? saved!.version, updatedAt: fresh?.updated_at ?? saved!.updated_at, createdVersion: version ? { id: version.id, version_number: version.version_number } : null, warnings: dsl.warnings });
});
