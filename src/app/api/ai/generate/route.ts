import { z } from "zod";
import { handler, json, parseBody, requireApiUser } from "@/lib/api";
import { runCloudOperation } from "@/features/ai/services/server";
import { DIAGRAM_TYPES, LAYOUT_DIRECTIONS } from "@/features/diagrams/schema/dsl";

export const maxDuration = 120;

const Schema = z.object({
  prompt: z.string().trim().min(3, "Describe the diagram in a few words.").max(4000),
  diagramId: z.string().max(64).optional(),
  diagramType: z.enum([...DIAGRAM_TYPES, "auto"]).optional(),
  layout: z.enum(LAYOUT_DIRECTIONS).optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(10).optional(),
});

export const POST = handler(async (request: Request) => {
  const { supabase, user } = await requireApiUser();
  const body = await parseBody(request, Schema, 60_000);
  const r = await runCloudOperation(supabase, user.id, "generate", (ai, signal) => ai.generateDiagram(body.prompt, { ...body, signal }), request.signal);
  return json({ diagram: r.value, warnings: r.warnings, model: r.model, provider: "gemini" });
});
