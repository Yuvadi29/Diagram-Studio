import { z } from "zod";
import { ApiError, handler, json, parseBody, requireApiUser } from "@/lib/api";
import { runCloudOperation } from "@/features/ai/services/server";
import { validateDiagram } from "@/features/diagrams/validation/sanitize";

export const maxDuration = 120;

const Schema = z.object({ diagram: z.unknown(), guidance: z.string().max(2000).optional() });

export const POST = handler(async (request: Request) => {
  const { supabase, user } = await requireApiUser();
  const body = await parseBody(request, Schema, 1_500_000);
  const v = validateDiagram(body.diagram);
  if (!v.success) throw new ApiError(400, "INVALID_DIAGRAM", "The current diagram is invalid.", v.errors);
  const r = await runCloudOperation(supabase, user.id, "scenes", (ai, signal) => ai.generateScenes(v.diagram, { signal, guidance: body.guidance }), request.signal);
  return json({ scenes: r.value, warnings: r.warnings, model: r.model, provider: "gemini" });
});
