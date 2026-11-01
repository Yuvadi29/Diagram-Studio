import { z } from "zod";
import type { DiagramDSL } from "../../diagrams/schema/dsl";
import { applyPatch, RefinementResponseSchema } from "../../diagrams/services/patch";
import { diffDiagrams, isEmptyDiff, summarizeDiff } from "../../diagrams/services/diff";
import { repairAndValidate } from "../../diagrams/validation/sanitize";
import {
  DEFAULT_TRANSITION,
  newSceneId,
  PresentationSceneSchema,
  type PresentationScene,
} from "../../presentations/scenes/schema";
import { reconcileScenes } from "../../presentations/scenes/reconcile";
import {
  buildGeneratePrompt,
  buildRefinePrompt,
  buildScenesPrompt,
  DIAGRAM_SYSTEM_PROMPT,
  REFINE_SYSTEM_PROMPT,
  SCENES_SYSTEM_PROMPT,
} from "../prompts";
import { DIAGRAM_JSON_SCHEMA, REFINEMENT_JSON_SCHEMA, SCENES_JSON_SCHEMA } from "../prompts/schemas";
import { AIError, type AIProvider, type LLMClient, type RefinementResult } from "../providers/types";
import { runStructured, type ParseOutcome } from "./structured";

const LooseScenesSchema = z.object({
  scenes: z
    .array(
      z.object({
        title: z.string().nullish(),
        description: z.string().nullish(),
        visibleNodeIds: z.array(z.string()).nullish(),
        visibleEdgeIds: z.array(z.string()).nullish(),
        highlightedNodeIds: z.array(z.string()).nullish(),
        highlightedEdgeIds: z.array(z.string()).nullish(),
        dimmedNodeIds: z.array(z.string()).nullish(),
        durationMs: z.number().nullish(),
        transition: z.string().nullish(),
      }),
    )
    .min(1)
    .max(20),
});

function unknownRefs(ids: (string[] | null | undefined)[], valid: Set<string>): string[] {
  return [...new Set(ids.flatMap((l) => l ?? []).filter((id) => !valid.has(id)))];
}

export function parseScenes(raw: unknown, diagram: DiagramDSL): ParseOutcome<PresentationScene[]> {
  const parsed = LooseScenesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`) };
  const nodeIds = new Set(diagram.nodes.map((n) => n.id));
  const edgeIds = new Set(diagram.edges.map((e) => e.id));
  const soft: string[] = [];
  const badNodes = unknownRefs(parsed.data.scenes.flatMap((s) => [s.visibleNodeIds, s.highlightedNodeIds, s.dimmedNodeIds]), nodeIds);
  const badEdges = unknownRefs(parsed.data.scenes.flatMap((s) => [s.visibleEdgeIds, s.highlightedEdgeIds]), edgeIds);
  if (badNodes.length) soft.push(`Unknown node ids used: ${badNodes.join(", ")}. Valid node ids: ${[...nodeIds].join(", ")}`);
  if (badEdges.length) soft.push(`Unknown edge ids used: ${badEdges.join(", ")}. Valid edge ids: ${[...edgeIds].join(", ")}`);

  const scenes: PresentationScene[] = parsed.data.scenes.slice(0, 12).map((s, i) => {
    const t = s.transition === "none" || s.transition === "zoom" || s.transition === "fade" ? s.transition : DEFAULT_TRANSITION.type;
    return {
      id: newSceneId(),
      title: (s.title?.trim() || `Scene ${i + 1}`).slice(0, 120),
      description: s.description?.trim() ? s.description.trim().slice(0, 1200) : undefined,
      order: i,
      visibleNodeIds: s.visibleNodeIds ?? [],
      visibleEdgeIds: s.visibleEdgeIds ?? [],
      highlightedNodeIds: s.highlightedNodeIds ?? [],
      highlightedEdgeIds: s.highlightedEdgeIds ?? [],
      dimmedNodeIds: s.dimmedNodeIds ?? [],
      cameraByFormat: { landscape: { mode: "auto" }, portrait: { mode: "auto" } },
      durationMs: Math.round(Math.min(20000, Math.max(2500, s.durationMs ?? 5000))),
      transition: { type: t, durationMs: t === "none" ? 0 : t === "zoom" ? 900 : 600 },
    };
  });
  const { scenes: reconciled, warnings } = reconcileScenes(scenes, diagram);
  const nonEmpty = reconciled.filter((s) => s.visibleNodeIds.length > 0).map((s, i) => ({ ...s, order: i }));
  if (!nonEmpty.length) return { ok: false, errors: ["Every scene was empty after removing unknown ids. Use only the listed node ids."] };
  for (const s of nonEmpty) {
    const v = PresentationSceneSchema.safeParse(s);
    if (!v.success) return { ok: false, errors: v.error.issues.slice(0, 5).map((i) => i.message) };
  }
  return { ok: true, value: nonEmpty, warnings, soft };
}

/**
 * Build an AIProvider on top of any LLM transport. The prompts, structured
 * output schemas, validation and repair are shared by every provider.
 */
export function createDiagramAI(llm: LLMClient): AIProvider {
  return {
    id: llm.provider,

    async generateDiagram(prompt, context = {}) {
      if (!prompt.trim()) throw new AIError("BAD_REQUEST", "Describe the diagram you want to create.");
      const diagramId = context.diagramId ?? "diagram";
      const fallbackType = context.diagramType && context.diagramType !== "auto" ? context.diagramType : undefined;
      const result = await runStructured<DiagramDSL>({
        llm,
        system: DIAGRAM_SYSTEM_PROMPT,
        prompt: buildGeneratePrompt(prompt, context),
        schema: DIAGRAM_JSON_SCHEMA as unknown as Record<string, unknown>,
        signal: context.signal,
        parse: (raw) => {
          const r = repairAndValidate(raw, { fallbackId: diagramId, fallbackType });
          if (!r.success) return { ok: false, errors: r.errors };
          if (r.diagram.nodes.length < 2) return { ok: false, errors: ["The diagram must contain at least 2 nodes."] };
          const soft = r.warnings.filter((w) => /does not exist|missing (node|group)/i.test(w));
          return { ok: true, value: { ...r.diagram, id: diagramId, layout: context.layout ?? r.diagram.layout }, warnings: r.warnings, soft };
        },
      });
      return { ...result, provider: llm.provider };
    },

    async refineDiagram(diagram, instruction, context = {}) {
      if (!instruction.trim()) throw new AIError("BAD_REQUEST", "Tell the assistant what to change.");
      const result = await runStructured<RefinementResult>({
        llm,
        system: REFINE_SYSTEM_PROMPT,
        prompt: buildRefinePrompt(diagram, instruction, context),
        schema: REFINEMENT_JSON_SCHEMA as unknown as Record<string, unknown>,
        signal: context.signal,
        parse: (raw) => {
          const parsed = RefinementResponseSchema.safeParse(raw);
          if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`) };
          const r = parsed.data;
          if (r.kind === "clarify") {
            return r.question ? { ok: true, value: { kind: "clarify", question: r.question }, warnings: [] } : { ok: false, errors: ["kind is clarify but question is missing"] };
          }
          if (r.kind === "explain") {
            return r.answer ? { ok: true, value: { kind: "explain", answer: r.answer }, warnings: [] } : { ok: false, errors: ["kind is explain but answer is missing"] };
          }
          const ops = r.operations ?? [];
          if (!ops.length) return { ok: false, errors: ['kind is "patch" but "operations" is empty. Provide operations, or use kind "clarify".'] };
          let applied;
          try {
            applied = applyPatch(diagram, ops);
          } catch (err) {
            return { ok: false, errors: [err instanceof Error ? err.message : String(err)] };
          }
          const diff = diffDiagrams(diagram, applied.diagram);
          if (isEmptyDiff(diff)) {
            return { ok: false, errors: ["The operations did not change the diagram.", ...applied.skipped] };
          }
          return {
            ok: true,
            value: {
              kind: "patch",
              diagram: applied.diagram,
              summary: r.summary?.trim() || summarizeDiff(diff),
              skipped: applied.skipped,
              layoutChanged: applied.layoutChanged,
              warnings: applied.skipped,
            },
            warnings: applied.skipped,
            soft: applied.skipped.length > ops.length / 2 ? applied.skipped : undefined,
          };
        },
      });
      return { ...result, provider: llm.provider };
    },

    async generateScenes(diagram, opts = {}) {
      if (!diagram.nodes.length) throw new AIError("BAD_REQUEST", "The diagram is empty. Add some components first.");
      const result = await runStructured<PresentationScene[]>({
        llm,
        system: SCENES_SYSTEM_PROMPT,
        prompt: buildScenesPrompt(diagram, opts.guidance),
        schema: SCENES_JSON_SCHEMA as unknown as Record<string, unknown>,
        signal: opts.signal,
        temperature: 0.3,
        parse: (raw) => parseScenes(raw, diagram),
      });
      return { ...result, provider: llm.provider };
    },
  };
}
