import type { Box } from "../../layout";
import type { PresentationModel } from "../rendering/model";
import { cameraFor, type PresentationScene } from "../scenes/schema";

export interface ElementVisual {
  opacity: number;
  /** 0..1 highlight strength. */
  highlight: number;
  /** 0..1 how much of an edge is drawn. */
  draw: number;
  scale: number;
}

export interface FrameState {
  /** Region of diagram space shown on the stage. */
  viewBox: Box;
  nodes: Record<string, ElementVisual>;
  edges: Record<string, ElementVisual>;
  groups: Record<string, number>;
  caption: { title: string; description?: string; opacity: number; index: number; total: number };
}

const HIDDEN: ElementVisual = { opacity: 0, highlight: 0, draw: 0, scale: 0.92 };

export function easeInOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function boundsOf(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
}

/** Expand a box to the stage's aspect ratio (never crops). */
export function fitToAspect(box: Box, aspect: number, margin = 0.08, minSize = 0): Box {
  let w = Math.max(box.width * (1 + margin * 2), minSize);
  let h = Math.max(box.height * (1 + margin * 2), minSize / aspect);
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

/** The camera (viewBox in diagram coordinates) for a scene. */
export function computeViewBox(model: PresentationModel, scene: PresentationScene | null): Box {
  const aspect = model.stage.width / Math.max(1, model.stage.height);
  const all = fitToAspect(model.bounds, aspect, 0.04);
  if (!scene) return all;
  const setting = cameraFor(scene, model.format);
  const boxOf = (ids: string[]) => model.nodes.filter((n) => ids.includes(n.id)).map((n) => n.box);
  // Never zoom in so far that a single box fills the stage.
  const minSize = Math.min(all.width, Math.max(...model.nodes.map((n) => n.box.width), 200) * 2.6);

  switch (setting.mode) {
    case "all":
      return all;
    case "highlighted": {
      const b = boundsOf(boxOf(scene.highlightedNodeIds ?? [])) ?? boundsOf(boxOf(scene.visibleNodeIds));
      return b ? fitToAspect(b, aspect, 0.12, minSize) : all;
    }
    case "custom": {
      const zoom = setting.zoom ?? 1;
      const w = all.width / zoom;
      const h = all.height / zoom;
      const cx = setting.x ?? all.x + all.width / 2;
      const cy = setting.y ?? all.y + all.height / 2;
      return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
    }
    case "auto":
    default: {
      const ids = [...scene.visibleNodeIds];
      const b = boundsOf(boxOf(ids));
      if (!b) return all;
      // Groups whose members are all visible are part of the framed area.
      const gb = model.groups.filter((g) => g.nodeIds.every((id) => ids.includes(id))).map((g) => g.box);
      // Routed edges (e.g. sequence messages below the participants) are framed too.
      const visEdges = new Set(scene.visibleEdgeIds);
      const eb = model.edges
        .filter((e) => e.points?.length && visEdges.has(e.id) && ids.includes(e.source) && ids.includes(e.target))
        .map((e) => boundsOf(e.points!.map(([px, py]) => ({ x: px - 24, y: py - 24, width: 48, height: 48 })))!);
      return fitToAspect(boundsOf([b, ...gb, ...eb])!, aspect, 0.06, minSize);
    }
  }
}

/** Target (fully transitioned) visuals for a scene. */
export function sceneVisuals(model: PresentationModel, scene: PresentationScene | null): Pick<FrameState, "nodes" | "edges" | "groups"> {
  const nodes: Record<string, ElementVisual> = {};
  const edges: Record<string, ElementVisual> = {};
  const groups: Record<string, number> = {};
  const visible = new Set(scene?.visibleNodeIds ?? []);
  const hi = new Set(scene?.highlightedNodeIds ?? []);
  const dim = new Set(scene?.dimmedNodeIds ?? []);
  const anyHighlight = hi.size > 0;
  for (const n of model.nodes) {
    if (!visible.has(n.id)) nodes[n.id] = HIDDEN;
    else
      nodes[n.id] = {
        opacity: dim.has(n.id) ? 0.28 : anyHighlight && !hi.has(n.id) ? 0.78 : 1,
        highlight: hi.has(n.id) ? 1 : 0,
        draw: 1,
        scale: 1,
      };
  }
  const visEdges = new Set(scene?.visibleEdgeIds ?? []);
  const hiEdges = new Set(scene?.highlightedEdgeIds ?? []);
  for (const e of model.edges) {
    const shown = visEdges.has(e.id) && visible.has(e.source) && visible.has(e.target);
    const faded = dim.has(e.source) || dim.has(e.target);
    edges[e.id] = shown
      ? { opacity: faded ? 0.25 : 1, highlight: hiEdges.has(e.id) ? 1 : 0, draw: 1, scale: 1 }
      : { ...HIDDEN, draw: 0 };
  }
  for (const g of model.groups) {
    groups[g.id] = g.nodeIds.some((id) => visible.has(id)) ? 1 : 0;
  }
  return { nodes, edges, groups };
}

function mix(a: ElementVisual, b: ElementVisual, t: number, mode: "fade" | "zoom"): ElementVisual {
  const appearing = a.opacity === 0 && b.opacity > 0;
  return {
    opacity: lerp(a.opacity, b.opacity, t),
    highlight: lerp(a.highlight, b.highlight, t),
    draw: appearing ? t : lerp(a.draw, b.draw, t),
    scale: appearing && mode === "zoom" ? lerp(0.85, 1, t) : lerp(a.scale, b.scale, t),
  };
}

/**
 * Interpolated frame between two scenes. `t` is transition progress (0..1).
 * Used identically by the live player and the frame-based video renderer.
 */
export function interpolateFrame(
  model: PresentationModel,
  from: PresentationScene | null,
  to: PresentationScene,
  t: number,
  meta: { index: number; total: number },
): FrameState {
  const type = to.transition.type;
  const p = type === "none" || to.transition.durationMs === 0 ? 1 : easeInOut(t);
  const a = sceneVisuals(model, from);
  const b = sceneVisuals(model, to);
  const va = computeViewBox(model, from ?? to);
  const vb = computeViewBox(model, to);
  const mode = type === "zoom" ? "zoom" : "fade";
  const nodes: Record<string, ElementVisual> = {};
  const edges: Record<string, ElementVisual> = {};
  const groups: Record<string, number> = {};
  for (const id of Object.keys(b.nodes)) nodes[id] = mix(a.nodes[id] ?? HIDDEN, b.nodes[id], p, mode);
  // Edges start drawing once their endpoints are mostly visible.
  const ep = Math.max(0, Math.min(1, (p - 0.25) / 0.75));
  for (const id of Object.keys(b.edges)) edges[id] = mix(a.edges[id] ?? HIDDEN, b.edges[id], ep, mode);
  for (const id of Object.keys(b.groups)) groups[id] = lerp(a.groups[id] ?? 0, b.groups[id], p);
  return {
    viewBox: {
      x: lerp(va.x, vb.x, p),
      y: lerp(va.y, vb.y, p),
      width: lerp(va.width, vb.width, p),
      height: lerp(va.height, vb.height, p),
    },
    nodes,
    edges,
    groups,
    caption: {
      title: to.title,
      description: to.description,
      opacity: from ? Math.min(1, p * 1.4) : 1,
      index: meta.index,
      total: meta.total,
    },
  };
}

/** A frame that shows the whole diagram (used for previews/thumbnails). */
export function staticFrame(model: PresentationModel, scene: PresentationScene | null, meta = { index: 0, total: 1 }): FrameState {
  if (scene) return interpolateFrame(model, null, { ...scene, transition: { type: "none", durationMs: 0 } }, 1, meta);
  const all: PresentationScene = {
    id: "all",
    title: model.title,
    order: 0,
    visibleNodeIds: model.nodes.map((n) => n.id),
    visibleEdgeIds: model.edges.map((e) => e.id),
    durationMs: 1000,
    transition: { type: "none", durationMs: 0 },
    cameraByFormat: { landscape: { mode: "all" }, portrait: { mode: "all" } },
  };
  return interpolateFrame(model, null, all, 1, meta);
}
