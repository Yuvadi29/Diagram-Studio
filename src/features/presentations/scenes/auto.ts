import type { DiagramDSL } from "../../diagrams/schema/dsl";
import { DEFAULT_TRANSITION, newSceneId, type PresentationScene } from "./schema";

/** BFS levels from source nodes, following edge order (deterministic). */
export function revealLevels(diagram: Pick<DiagramDSL, "nodes" | "edges">): string[][] {
  const ids = diagram.nodes.map((n) => n.id);
  const incoming = new Map(ids.map((id) => [id, 0]));
  for (const e of diagram.edges) if (e.source !== e.target) incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
  const level = new Map<string, number>();
  const queue: string[] = [];
  const sources = ids.filter((id) => (incoming.get(id) ?? 0) === 0);
  for (const s of sources.length ? sources : ids.slice(0, 1)) {
    level.set(s, 0);
    queue.push(s);
  }
  while (true) {
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of diagram.edges) {
        if (e.source === cur && !level.has(e.target)) {
          level.set(e.target, level.get(cur)! + 1);
          queue.push(e.target);
        }
      }
    }
    // Disconnected or cycle-only components: start a new BFS from the first unvisited node.
    const next = ids.find((id) => !level.has(id));
    if (!next) break;
    const maxLevel = Math.max(0, ...level.values());
    level.set(next, maxLevel + 1);
    queue.push(next);
  }
  const levels: string[][] = [];
  for (const id of ids) {
    const l = level.get(id)!;
    (levels[l] ??= []).push(id);
  }
  return levels.filter((l) => l && l.length);
}

/**
 * Deterministic progressive-reveal scenes (no AI needed): one scene per flow
 * level, then a final "complete workflow" scene.
 */
export function autoGenerateScenes(diagram: DiagramDSL, maxSteps = 7): PresentationScene[] {
  if (!diagram.nodes.length) return [];
  let levels = revealLevels(diagram);
  while (levels.length > maxSteps) {
    // Merge the two smallest adjacent levels.
    let best = 0;
    for (let i = 1; i < levels.length - 1; i++) {
      if (levels[i].length + levels[i + 1].length < levels[best].length + levels[best + 1].length) best = i;
    }
    levels = [...levels.slice(0, best), [...levels[best], ...levels[best + 1]], ...levels.slice(best + 2)];
  }

  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  const scenes: PresentationScene[] = [];
  const visible = new Set<string>();
  const shownEdges = new Set<string>();

  levels.forEach((levelIds, i) => {
    levelIds.forEach((id) => visible.add(id));
    const newEdges = diagram.edges.filter((e) => !shownEdges.has(e.id) && visible.has(e.source) && visible.has(e.target));
    newEdges.forEach((e) => shownEdges.add(e.id));
    const labels = levelIds.map((id) => byId.get(id)!.label);
    const descriptions = levelIds.map((id) => byId.get(id)!.description).filter(Boolean) as string[];
    const flows = newEdges
      .filter((e) => e.label)
      .slice(0, 3)
      .map((e) => `${byId.get(e.source)!.label} → ${byId.get(e.target)!.label}: ${e.label}`);
    const title = i === 0 ? `Start: ${labels.slice(0, 3).join(", ")}` : `Step ${i + 1}: ${labels.slice(0, 3).join(", ")}`;
    scenes.push({
      id: newSceneId(),
      title: title.length > 110 ? `${title.slice(0, 109)}…` : title,
      description: [...descriptions, ...flows].join("\n") || undefined,
      order: scenes.length,
      visibleNodeIds: [...visible],
      visibleEdgeIds: [...shownEdges],
      highlightedNodeIds: [...levelIds],
      highlightedEdgeIds: newEdges.map((e) => e.id),
      dimmedNodeIds: [],
      cameraByFormat: { landscape: { mode: "auto" }, portrait: { mode: "auto" } },
      durationMs: Math.min(9000, 3500 + 700 * levelIds.length + 400 * flows.length),
      transition: i === 0 ? { type: "fade", durationMs: 500 } : DEFAULT_TRANSITION,
    });
  });

  scenes.push({
    id: newSceneId(),
    title: "Complete workflow",
    description: diagram.description ?? `The full ${diagram.title} flow, end to end.`,
    order: scenes.length,
    visibleNodeIds: diagram.nodes.map((n) => n.id),
    visibleEdgeIds: diagram.edges.map((e) => e.id),
    highlightedNodeIds: [],
    highlightedEdgeIds: diagram.edges.map((e) => e.id),
    dimmedNodeIds: [],
    cameraByFormat: { landscape: { mode: "all" }, portrait: { mode: "all" } },
    durationMs: 6000,
    transition: { type: "zoom", durationMs: 900 },
  });
  return scenes;
}
