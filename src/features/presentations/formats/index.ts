import { z } from "zod";
import type { DiagramDSL } from "../../diagrams/schema/dsl";
import { boxesOverlap, computeLayout, type Box, type LayoutResult } from "../../layout";
import type { PresentationFormat } from "../scenes/schema";

/**
 * Presentation formats. Both share the logical DiagramDSL (same node/edge ids)
 * but keep independent node positions, so a portrait presentation is a real
 * vertical layout rather than a cropped or scaled landscape one.
 */

const BoxSchema = z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().positive(), height: z.number().positive() });

export const PresentationFormatConfigSchema = z.object({
  width: z.number().int().min(320).max(7680),
  height: z.number().int().min(320).max(7680),
  layout: z.enum(["horizontal", "vertical"]),
  backgroundColor: z.string().max(32).optional(),
  padding: z.number().min(0).max(400),
  /** Node positions for this format (diagram coordinates). */
  positions: z.record(z.string(), BoxSchema).optional(),
  /** Nodes the user positioned by hand in this format (never auto-moved). */
  manualNodeIds: z.array(z.string()).optional(),
  /** Where the suggested layout came from. */
  layoutSource: z.enum(["editor", "auto"]).optional(),
});

export type PresentationFormatConfig = z.infer<typeof PresentationFormatConfigSchema>;

export interface PresentationFormats {
  landscape: PresentationFormatConfig;
  portrait: PresentationFormatConfig;
}

export const DEFAULT_FORMATS: PresentationFormats = {
  landscape: { width: 1920, height: 1080, layout: "horizontal", padding: 96, backgroundColor: "#0f1117" },
  portrait: { width: 1080, height: 1920, layout: "vertical", padding: 72, backgroundColor: "#0f1117" },
};

export const FORMAT_LABELS: Record<PresentationFormat, string> = {
  landscape: "Landscape 16:9",
  portrait: "Portrait 9:16",
};

export function aspectRatio(cfg: Pick<PresentationFormatConfig, "width" | "height">): number {
  return cfg.width / cfg.height;
}

/** Caption band reserved for scene titles/descriptions, in output pixels. */
export function captionArea(format: PresentationFormat, cfg: PresentationFormatConfig): Box {
  if (format === "portrait") {
    const h = Math.round(cfg.height * 0.24);
    return { x: cfg.padding, y: cfg.height - h - cfg.padding * 0.5, width: cfg.width - cfg.padding * 2, height: h };
  }
  const h = Math.round(cfg.height * 0.17);
  return { x: cfg.padding, y: cfg.height - h - cfg.padding * 0.4, width: cfg.width - cfg.padding * 2, height: h };
}

/** Area available for the diagram itself, in output pixels. */
export function stageArea(format: PresentationFormat, cfg: PresentationFormatConfig): Box {
  const cap = captionArea(format, cfg);
  return { x: cfg.padding, y: cfg.padding, width: cfg.width - cfg.padding * 2, height: cap.y - cfg.padding * 1.25 };
}

/** Layout used for a format's suggested positions. */
export function formatLayout(diagram: DiagramDSL, format: PresentationFormat): LayoutResult {
  return format === "portrait"
    ? computeLayout(diagram, { direction: "TB", compact: true })
    : computeLayout(diagram, { direction: diagram.layout === "top-to-bottom" ? "TB" : "LR" });
}

/**
 * Suggested positions for a format.
 * Landscape mirrors the editor canvas when every node is on it (what the user
 * designed); portrait always gets its own vertical layout.
 */
export function suggestPositions(
  diagram: DiagramDSL,
  format: PresentationFormat,
  editorBoxes?: Record<string, Box>,
): { positions: Record<string, Box>; source: "editor" | "auto" } {
  if (
    format === "landscape" &&
    diagram.type !== "sequence" &&
    editorBoxes &&
    diagram.nodes.length > 0 &&
    diagram.nodes.every((n) => editorBoxes[n.id])
  ) {
    const positions: Record<string, Box> = {};
    for (const n of diagram.nodes) positions[n.id] = { ...editorBoxes[n.id] };
    return { positions, source: "editor" };
  }
  return { positions: { ...formatLayout(diagram, format).nodes }, source: "auto" };
}

/**
 * Full set of positions for rendering: stored positions for known nodes,
 * suggestions for nodes added since (placed relative to their neighbours).
 * Stored/manual positions are never discarded.
 */
export function resolvePositions(
  diagram: DiagramDSL,
  format: PresentationFormat,
  cfg: PresentationFormatConfig,
  editorBoxes?: Record<string, Box>,
): Record<string, Box> {
  if (diagram.type === "sequence") return formatLayout(diagram, format).nodes;
  const stored = cfg.positions ?? {};
  const known = diagram.nodes.filter((n) => stored[n.id]);
  if (known.length === diagram.nodes.length) {
    const out: Record<string, Box> = {};
    for (const n of diagram.nodes) out[n.id] = stored[n.id];
    return out;
  }
  const suggestion = suggestPositions(diagram, format, editorBoxes).positions;
  if (!known.length) return suggestion;

  const out: Record<string, Box> = {};
  for (const n of known) out[n.id] = stored[n.id];
  const delta = (ids: string[]): [number, number] => {
    const use = ids.filter((id) => out[id] && suggestion[id]);
    if (!use.length) return [0, 0];
    return [
      use.reduce((a, id) => a + out[id].x - suggestion[id].x, 0) / use.length,
      use.reduce((a, id) => a + out[id].y - suggestion[id].y, 0) / use.length,
    ];
  };
  for (const n of diagram.nodes) {
    if (out[n.id]) continue;
    const s = suggestion[n.id];
    const nbrs = diagram.edges
      .filter((e) => e.source === n.id || e.target === n.id)
      .map((e) => (e.source === n.id ? e.target : e.source))
      .filter((id) => out[id]);
    const [dx, dy] = delta(nbrs.length ? nbrs : known.map((k) => k.id));
    const box = { ...s, x: Math.round(s.x + dx), y: Math.round(s.y + dy) };
    for (let i = 0; i < 100; i++) {
      const hit = Object.values(out).find((o) => boxesOverlap(box, o, 24));
      if (!hit) break;
      if (format === "portrait") box.x = hit.x + hit.width + 40;
      else box.y = hit.y + hit.height + 40;
    }
    out[n.id] = box;
  }
  return out;
}

/**
 * Regenerate the suggested layout for a format. Manually positioned nodes are
 * kept unless `discardManual` is explicitly requested.
 */
export function regenerateFormatLayout(
  diagram: DiagramDSL,
  format: PresentationFormat,
  cfg: PresentationFormatConfig,
  editorBoxes?: Record<string, Box>,
  { discardManual = false }: { discardManual?: boolean } = {},
): PresentationFormatConfig {
  const { positions, source } = suggestPositions(diagram, format, editorBoxes);
  const manual = discardManual ? [] : (cfg.manualNodeIds ?? []).filter((id) => cfg.positions?.[id] && positions[id]);
  const next: Record<string, Box> = { ...positions };
  for (const id of manual) next[id] = cfg.positions![id];
  return { ...cfg, positions: next, manualNodeIds: manual, layoutSource: source };
}

/** Move a node in one format only; marks it as manually positioned. */
export function moveNodeInFormat(cfg: PresentationFormatConfig, nodeId: string, box: Box, allPositions: Record<string, Box>): PresentationFormatConfig {
  const positions = { ...allPositions, ...(cfg.positions ?? {}), [nodeId]: box };
  const manualNodeIds = [...new Set([...(cfg.manualNodeIds ?? []), nodeId])];
  return { ...cfg, positions, manualNodeIds };
}

export function normalizeFormats(input: Partial<Record<PresentationFormat, unknown>> | null | undefined): PresentationFormats {
  const parse = (f: PresentationFormat) => {
    const r = PresentationFormatConfigSchema.safeParse(input?.[f]);
    return r.success ? r.data : DEFAULT_FORMATS[f];
  };
  return { landscape: parse("landscape"), portrait: parse("portrait") };
}

/**
 * The configuration actually used for rendering: fresh suggested positions
 * (mirroring the current editor layout for landscape, an automatic vertical
 * layout for portrait) with every manually positioned node kept in place.
 */
export function effectiveFormatConfig(
  diagram: DiagramDSL,
  format: PresentationFormat,
  cfg: PresentationFormatConfig,
  editorBoxes?: Record<string, Box>,
): PresentationFormatConfig {
  return regenerateFormatLayout(diagram, format, cfg, editorBoxes);
}
