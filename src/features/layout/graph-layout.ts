import * as dagre from "@dagrejs/dagre";
import type { DiagramDSL } from "../diagrams/schema/dsl";
import { getNodeSize } from "./sizing";
import { GROUP_PADDING, type Box, type LayoutOptions, type LayoutResult, type Point } from "./types";

interface DagreNodeLabel {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DagreEdgeLabel {
  points?: { x: number; y: number }[];
  x?: number;
  y?: number;
}

export function graphLayout(diagram: DiagramDSL, options: LayoutOptions = {}): LayoutResult {
  const direction = options.direction ?? (diagram.layout === "top-to-bottom" ? "TB" : "LR");
  const compact = options.compact ?? false;
  const groups = (diagram.groups ?? []).filter((g) => g.nodeIds.length > 0);
  const hasGroups = groups.length > 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Graph = (dagre as any).graphlib.Graph;
  const g = new Graph({ compound: hasGroups, multigraph: true });
  g.setGraph({
    rankdir: direction,
    nodesep: options.nodeSpacing ?? (compact ? 40 : 64),
    ranksep: options.rankSpacing ?? (compact ? 70 : 100),
    edgesep: 24,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const sizes: Record<string, { width: number; height: number }> = {};
  for (const node of diagram.nodes) {
    const size = options.nodeSizes?.[node.id] ?? getNodeSize(node);
    sizes[node.id] = size;
    g.setNode(node.id, { width: size.width, height: size.height });
  }
  if (hasGroups) {
    for (const group of groups) {
      g.setNode(`__group__${group.id}`, { label: group.label, paddingTop: GROUP_PADDING.top });
      for (const nid of group.nodeIds) {
        if (sizes[nid]) g.setParent(nid, `__group__${group.id}`);
      }
    }
  }
  for (const edge of diagram.edges) {
    if (!sizes[edge.source] || !sizes[edge.target]) continue;
    const label = edge.label ?? "";
    g.setEdge(
      edge.source,
      edge.target,
      label
        ? { width: Math.min(220, label.length * 7.5 + 20), height: 26, labelpos: "c" }
        : { width: 0, height: 0 },
      edge.id,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (dagre as any).layout(g);

  const nodes: Record<string, Box> = {};
  for (const node of diagram.nodes) {
    const n = g.node(node.id) as DagreNodeLabel | undefined;
    if (!n) continue;
    nodes[node.id] = {
      x: Math.round(n.x - n.width / 2),
      y: Math.round(n.y - n.height / 2),
      width: Math.round(n.width),
      height: Math.round(n.height),
    };
  }

  const groupBoxes: Record<string, Box> = {};
  for (const group of groups) {
    const members = group.nodeIds.map((id) => nodes[id]).filter(Boolean);
    if (!members.length) continue;
    const minX = Math.min(...members.map((b) => b.x)) - GROUP_PADDING.x;
    const minY = Math.min(...members.map((b) => b.y)) - GROUP_PADDING.top;
    const maxX = Math.max(...members.map((b) => b.x + b.width)) + GROUP_PADDING.x;
    const maxY = Math.max(...members.map((b) => b.y + b.height)) + GROUP_PADDING.bottom;
    groupBoxes[group.id] = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  const edges: LayoutResult["edges"] = {};
  for (const edge of diagram.edges) {
    const e = g.edge({ v: edge.source, w: edge.target, name: edge.id }) as DagreEdgeLabel | undefined;
    if (!e?.points?.length) continue;
    const points: Point[] = e.points.map((p) => [Math.round(p.x), Math.round(p.y)]);
    edges[edge.id] = {
      points,
      labelPosition: edge.label && e.x !== undefined && e.y !== undefined ? { x: Math.round(e.x), y: Math.round(e.y) } : undefined,
    };
  }

  return { direction, nodes, groups: groupBoxes, edges, bounds: computeBounds(nodes, groupBoxes) };
}

export function computeBounds(nodes: Record<string, Box>, groups: Record<string, Box> = {}): Box {
  const boxes = [...Object.values(nodes), ...Object.values(groups)];
  if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
