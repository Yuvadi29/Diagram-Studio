import type { DiagramDSL } from "../../diagrams/schema/dsl";
import { createEmptyDiagram } from "../../diagrams/schema/dsl";
import { repairAndValidate } from "../../diagrams/validation/sanitize";
import { getNodeBoxes, getNodeStyles, type ExElement } from "../../excalidraw/adapter";
import { effectiveFormatConfig, normalizeFormats } from "../../presentations/formats";
import { buildPresentationModel } from "../../presentations/rendering/model";
import { reconcileScenes } from "../../presentations/scenes/reconcile";
import { PresentationSceneSchema, type PresentationFormat, type PresentationScene } from "../../presentations/scenes/schema";
import type { VideoProps } from "../remotion/diagram-video";

interface Rows {
  diagram: { id: string; title: string; diagram_dsl: unknown; excalidraw_data: { elements?: unknown[] } | null };
  presentation: { landscape_config: unknown; portrait_config: unknown };
  scenes: { id: string; title: string; description: string | null; order_index: number; scene_data: Record<string, unknown> }[];
}

/** Turn database rows into the exact props the video composition renders. Pure + testable. */
export function buildVideoProps(rows: Rows, format: PresentationFormat): VideoProps {
  const r = repairAndValidate(rows.diagram.diagram_dsl, { fallbackId: rows.diagram.id, fallbackTitle: rows.diagram.title });
  const diagram: DiagramDSL = r.success ? r.diagram : createEmptyDiagram(rows.diagram.id, rows.diagram.title);
  const parsed: PresentationScene[] = [];
  for (const s of rows.scenes) {
    const p = PresentationSceneSchema.safeParse({ ...s.scene_data, id: s.id, title: s.title, description: s.description ?? undefined, order: s.order_index });
    if (p.success) parsed.push(p.data);
  }
  const { scenes } = reconcileScenes(parsed, diagram);
  if (!scenes.length) throw new Error("This presentation has no valid scenes.");
  const elements = (rows.diagram.excalidraw_data?.elements ?? []) as ExElement[];
  const editorBoxes = getNodeBoxes(elements);
  const formats = normalizeFormats({ landscape: rows.presentation.landscape_config, portrait: rows.presentation.portrait_config });
  const cfg = effectiveFormatConfig(diagram, format, formats[format], editorBoxes);
  const model = buildPresentationModel(diagram, format, cfg, { colors: getNodeStyles(elements), editorBoxes });
  return { model, scenes };
}
