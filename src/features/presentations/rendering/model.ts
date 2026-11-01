import type { DiagramDSL, EdgeType, NodeType } from "../../diagrams/schema/dsl";
import { formatLayout, resolvePositions, stageArea, captionArea, type PresentationFormatConfig } from "../formats";
import type { PresentationFormat } from "../scenes/schema";
import type { Box, Point } from "../../layout";
import { GROUP_PADDING } from "../../layout/types";

/**
 * A self-contained, serialisable description of everything needed to render a
 * presentation in one format. It does not depend on Excalidraw or the editor,
 * so the player, scene-image export and the Remotion video renderer all
 * consume exactly the same data.
 */
export interface PresentationNode {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  box: Box;
  stroke: string;
  fill: string;
  dashed: boolean;
}

export interface PresentationEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: EdgeType;
  /** Explicit route (sequence messages); otherwise drawn box-to-box. */
  points?: Point[];
}

export interface PresentationModel {
  format: PresentationFormat;
  width: number;
  height: number;
  background: string;
  theme: "dark" | "light";
  title: string;
  stage: Box;
  caption: Box;
  nodes: PresentationNode[];
  edges: PresentationEdge[];
  groups: { id: string; label: string; nodeIds: string[]; box: Box }[];
  lifelines: { id: string; x: number; y1: number; y2: number }[];
  /** Bounds of the whole diagram in diagram coordinates. */
  bounds: Box;
}

export interface NodeColor {
  strokeColor: string;
  backgroundColor: string;
  strokeStyle?: string;
}

const DEFAULT_COLORS: Record<NodeType, { stroke: string; fill: string; dashed?: boolean }> = {
  actor: { stroke: "#2f9e44", fill: "#b2f2bb" },
  service: { stroke: "#1971c2", fill: "#a5d8ff" },
  database: { stroke: "#6741d9", fill: "#d0bfff" },
  queue: { stroke: "#f08c00", fill: "#ffec99" },
  cache: { stroke: "#c2255c", fill: "#fcc2d7" },
  gateway: { stroke: "#0c8599", fill: "#99e9f2" },
  process: { stroke: "#495057", fill: "#e9ecef" },
  decision: { stroke: "#e8590c", fill: "#ffd8a8" },
  "external-system": { stroke: "#868e96", fill: "#f1f3f5", dashed: true },
  component: { stroke: "#3b5bdb", fill: "#bac8ff" },
  annotation: { stroke: "#adb5bd", fill: "transparent" },
};

export function buildPresentationModel(
  diagram: DiagramDSL,
  format: PresentationFormat,
  cfg: PresentationFormatConfig,
  opts: { colors?: Record<string, NodeColor>; editorBoxes?: Record<string, Box>; theme?: "dark" | "light" } = {},
): PresentationModel {
  const theme = opts.theme ?? "dark";
  const positions = resolvePositions(diagram, format, cfg, opts.editorBoxes);
  const nodes: PresentationNode[] = diagram.nodes
    .filter((n) => positions[n.id])
    .map((n) => {
      const d = DEFAULT_COLORS[n.type];
      const c = opts.colors?.[n.id];
      const fill = c && c.backgroundColor && c.backgroundColor !== "transparent" ? c.backgroundColor : d.fill;
      return {
        id: n.id,
        type: n.type,
        label: n.label,
        description: n.description,
        box: positions[n.id],
        stroke: c?.strokeColor ?? d.stroke,
        fill: n.type === "annotation" ? "transparent" : fill,
        dashed: c?.strokeStyle ? c.strokeStyle !== "solid" : Boolean(d.dashed),
      };
    });
  const nodeIds = new Set(nodes.map((n) => n.id));

  let lifelines: PresentationModel["lifelines"] = [];
  const edgeRoutes: Record<string, Point[]> = {};
  if (diagram.type === "sequence") {
    const layout = formatLayout(diagram, format);
    lifelines = Object.entries(layout.lifelines ?? {}).map(([id, l]) => ({ id, ...l }));
    for (const [id, r] of Object.entries(layout.edges)) edgeRoutes[id] = r.points;
  }

  const edges: PresentationEdge[] = diagram.edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label, type: e.type, points: edgeRoutes[e.id] }));

  const groups = (diagram.groups ?? [])
    .map((g) => {
      const members = g.nodeIds.map((id) => positions[id]).filter(Boolean);
      if (!members.length) return null;
      const x = Math.min(...members.map((b) => b.x)) - GROUP_PADDING.x;
      const y = Math.min(...members.map((b) => b.y)) - GROUP_PADDING.top;
      const w = Math.max(...members.map((b) => b.x + b.width)) + GROUP_PADDING.x - x;
      const h = Math.max(...members.map((b) => b.y + b.height)) + GROUP_PADDING.bottom - y;
      return { id: g.id, label: g.label, nodeIds: g.nodeIds, box: { x, y, width: w, height: h } };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

  const all = [...nodes.map((n) => n.box), ...groups.map((g) => g.box)];
  for (const l of lifelines) all.push({ x: l.x - 1, y: l.y1, width: 2, height: l.y2 - l.y1 });
  const bounds = all.length
    ? (() => {
        const x = Math.min(...all.map((b) => b.x));
        const y = Math.min(...all.map((b) => b.y));
        return { x, y, width: Math.max(...all.map((b) => b.x + b.width)) - x, height: Math.max(...all.map((b) => b.y + b.height)) - y };
      })()
    : { x: 0, y: 0, width: 100, height: 100 };

  return {
    format,
    width: cfg.width,
    height: cfg.height,
    background: cfg.backgroundColor ?? (theme === "dark" ? "#0f1117" : "#ffffff"),
    theme,
    title: diagram.title,
    stage: stageArea(format, cfg),
    caption: captionArea(format, cfg),
    nodes,
    edges,
    groups,
    lifelines,
    bounds,
  };
}
