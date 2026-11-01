import type { DiagramDSL } from "../../diagrams/schema/dsl";
import type { PresentationScene } from "./schema";

/**
 * Make scenes consistent with the current diagram:
 * - drop references to nodes/edges that no longer exist,
 * - highlighted components are always visible,
 * - order is a dense 0..n-1 sequence.
 */
export function reconcileScenes(
  scenes: PresentationScene[],
  diagram: Pick<DiagramDSL, "nodes" | "edges">,
): { scenes: PresentationScene[]; warnings: string[] } {
  const nodeIds = new Set(diagram.nodes.map((n) => n.id));
  const edgeIds = new Set(diagram.edges.map((e) => e.id));
  const warnings: string[] = [];
  const keep = (ids: string[] | undefined, valid: Set<string>, what: string, scene: string) => {
    const list = ids ?? [];
    const kept = [...new Set(list.filter((id) => valid.has(id)))];
    const dropped = list.length - list.filter((id) => valid.has(id)).length;
    if (dropped > 0) warnings.push(`Scene "${scene}" referenced ${dropped} ${what} that no longer exist${dropped === 1 ? "s" : ""}; removed.`);
    return kept;
  };

  const out = [...scenes]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => {
      const highlightedNodeIds = keep(s.highlightedNodeIds, nodeIds, "component", s.title);
      const visibleNodeIds = [...new Set([...keep(s.visibleNodeIds, nodeIds, "component", s.title), ...highlightedNodeIds])];
      const highlightedEdgeIds = keep(s.highlightedEdgeIds, edgeIds, "connection", s.title);
      const visibleEdgeIds = [...new Set([...keep(s.visibleEdgeIds, edgeIds, "connection", s.title), ...highlightedEdgeIds])];
      const dimmedNodeIds = keep(s.dimmedNodeIds, nodeIds, "component", s.title).filter((id) => !highlightedNodeIds.includes(id));
      return { ...s, order: i, visibleNodeIds, visibleEdgeIds, highlightedNodeIds, highlightedEdgeIds, dimmedNodeIds };
    });
  return { scenes: out, warnings };
}

export function reorderScenes(scenes: PresentationScene[], fromIndex: number, toIndex: number): PresentationScene[] {
  const sorted = [...scenes].sort((a, b) => a.order - b.order);
  const [moved] = sorted.splice(fromIndex, 1);
  if (!moved) return sorted;
  sorted.splice(Math.max(0, Math.min(toIndex, sorted.length)), 0, moved);
  return sorted.map((s, i) => ({ ...s, order: i }));
}

/** Edges are only shown when both endpoints are visible. */
export function effectiveVisibleEdges(scene: PresentationScene, diagram: Pick<DiagramDSL, "edges">): Set<string> {
  const nodes = new Set(scene.visibleNodeIds);
  return new Set(
    diagram.edges.filter((e) => scene.visibleEdgeIds.includes(e.id) && nodes.has(e.source) && nodes.has(e.target)).map((e) => e.id),
  );
}
