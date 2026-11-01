import { z } from "zod";
import { ApiError, handler, json, parseBody, requireApiUser } from "@/lib/api";
import { runCloudOperation } from "@/features/ai/services/server";
import { validateDiagram } from "@/features/diagrams/validation/sanitize";

export const maxDuration = 120;

const Schema = z.object({
  diagram: z.unknown(),
  instruction: z.string().trim().min(2).max(2000),
  selectedNodeIds: z.array(z.string().max(64)).max(100).optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(10).optional(),
});

export const POST = handler(async (request: Request) => {
  const { supabase, user } = await requireApiUser();
  const body = await parseBody(request, Schema, 1_500_000);
  const v = validateDiagram(body.diagram);
  if (!v.success) throw new ApiError(400, "INVALID_DIAGRAM", "The current diagram is invalid.", v.errors);
  const r = await runCloudOperation(
    supabase,
    user.id,
    "refine",
    (ai, signal) => ai.refineDiagram(v.diagram, body.instruction, { selectedNodeIds: body.selectedNodeIds, history: body.history, signal }),
    request.signal,
  );
  return json({ result: r.value, warnings: r.warnings, model: r.model, provider: "gemini" });
});
