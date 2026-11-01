import type { DiagramDSL } from "../diagrams/schema/dsl";
import { computeBounds } from "./graph-layout";
import { getNodeSize } from "./sizing";
import type { Box, LayoutOptions, LayoutResult } from "./types";

/**
 * Sequence diagrams: participants laid out in a row (in node order), each with
 * a vertical lifeline; every edge is a horizontal message, ordered top-to-bottom
 * in edge order.
 */
export function sequenceLayout(diagram: DiagramDSL, options: LayoutOptions = {}): LayoutResult {
  const gap = options.nodeSpacing ?? (options.compact ? 60 : 110);
  const messageGap = options.compact ? 64 : 76;
  const participants = diagram.nodes.filter((n) => n.type !== "annotation");
  const nodes: Record<string, Box> = {};
  let x = 40;
  const top = 40;
  for (const node of participants) {
    const size = options.nodeSizes?.[node.id] ?? getNodeSize({ ...node, type: node.type === "decision" ? "process" : node.type });
    nodes[node.id] = { x, y: top, width: size.width, height: size.height };
    x += size.width + gap;
  }
  const headerBottom = Math.max(top, ...Object.values(nodes).map((b) => b.y + b.height));
  const firstMessageY = headerBottom + 60;
  const centerX = (id: string) => nodes[id].x + nodes[id].width / 2;

  const edges: LayoutResult["edges"] = {};
  let y = firstMessageY;
  for (const edge of diagram.edges) {
    if (!nodes[edge.source] || !nodes[edge.target]) continue;
    const sx = centerX(edge.source);
    const tx = centerX(edge.target);
    if (edge.source === edge.target) {
      edges[edge.id] = {
        points: [
          [sx, y],
          [sx + 60, y],
          [sx + 60, y + 30],
          [sx, y + 30],
        ],
        labelPosition: { x: sx + 70, y: y + 15 },
      };
      y += messageGap + 20;
    } else {
      edges[edge.id] = { points: [[sx, y], [tx, y]], labelPosition: { x: (sx + tx) / 2, y: y - 14 } };
      y += messageGap;
    }
  }

  const lifelineEnd = y + 20;
  const lifelines: Record<string, { x: number; y1: number; y2: number }> = {};
  for (const node of participants) {
    lifelines[node.id] = { x: centerX(node.id), y1: nodes[node.id].y + nodes[node.id].height, y2: lifelineEnd };
  }

  // Annotations go below the diagram.
  let ax = 40;
  for (const node of diagram.nodes.filter((n) => n.type === "annotation")) {
    const size = getNodeSize(node);
    nodes[node.id] = { x: ax, y: lifelineEnd + 30, width: size.width, height: size.height };
    ax += size.width + 40;
  }

  const bounds = computeBounds(nodes);
  const fullBounds = { ...bounds, height: Math.max(bounds.height, lifelineEnd - bounds.y) };
  return { direction: "LR", nodes, groups: {}, edges, lifelines, bounds: fullBounds };
}
