import {
  buildPresentationModel,
  DEFAULT_FORMATS,
  effectiveFormatConfig,
  interpolateFrame,
  renderFrameSvg,
  revealLevels,
  type FrameState,
  type PresentationFormat,
  type PresentationModel,
  type PresentationScene,
} from "@/features/presentations";
import type { Topic } from "./topics";

/**
 * Everything the landing page renders for one topic, built once and cached.
 * `canvas` is the light, sketchy editor view laid out from the union of the
 * diagram before and after the AI edit, so nothing jumps when the edit lands.
 */
export interface TopicModels {
  canvas: PresentationModel;
  landscape: PresentationModel;
  portrait: PresentationModel;
  /** Cumulative reveal steps for the "drawing" animation (before the edit). */
  drawSteps: PresentationScene[];
  beforeScene: PresentationScene;
  afterScene: PresentationScene;
  /** Plain view of the edited diagram on the canvas (used for the PNG preview). */
  plainAfter: PresentationScene;
}

const STAGE_BG = "#0f1117";
const cache = new Map<string, TopicModels>();
const ALL = { landscape: { mode: "all" as const }, portrait: { mode: "all" as const } };

function canvasScene(id: string, nodeIds: string[], edgeIds: string[], extra: Partial<PresentationScene> = {}): PresentationScene {
  return {
    id,
    title: "",
    order: 0,
    visibleNodeIds: nodeIds,
    visibleEdgeIds: edgeIds,
    cameraByFormat: ALL,
    durationMs: 1000,
    transition: { type: "fade", durationMs: 600 },
    ...extra,
  };
}

export function modelsFor(t: Topic): TopicModels {
  const hit = cache.get(t.id);
  if (hit) return hit;

  const pad = 28;
  const ccfg = { ...DEFAULT_FORMATS.landscape, backgroundColor: "transparent", padding: pad };
  const c = buildPresentationModel(t.union, "landscape", effectiveFormatConfig(t.union, "landscape", ccfg), { theme: "light" });
  const canvas: PresentationModel = { ...c, stage: { x: pad, y: pad, width: c.width - pad * 2, height: c.height - pad * 2 } };

  const stage = (f: PresentationFormat) =>
    buildPresentationModel(t.after, f, effectiveFormatConfig(t.after, f, { ...DEFAULT_FORMATS[f], backgroundColor: STAGE_BG }), { theme: "dark" });

  const visible: string[] = [];
  const drawSteps = revealLevels(t.before).map((level, i) => {
    visible.push(...level);
    const set = new Set(visible);
    return canvasScene(
      `draw-${i}`,
      [...visible],
      t.before.edges.filter((e) => set.has(e.source) && set.has(e.target)).map((e) => e.id),
    );
  });

  const beforeNodes = new Set(t.before.nodes.map((n) => n.id));
  const beforeEdges = new Set(t.before.edges.map((e) => e.id));
  const addedNodes = t.after.nodes.filter((n) => !beforeNodes.has(n.id)).map((n) => n.id);
  const addedEdges = t.after.edges.filter((e) => !beforeEdges.has(e.id)).map((e) => e.id);
  const afterNodeIds = t.after.nodes.map((n) => n.id);
  const afterEdgeIds = t.after.edges.map((e) => e.id);

  const m: TopicModels = {
    canvas,
    landscape: stage("landscape"),
    portrait: stage("portrait"),
    drawSteps,
    beforeScene: canvasScene("before", [...beforeNodes], [...beforeEdges]),
    afterScene: canvasScene("after", afterNodeIds, afterEdgeIds, { highlightedNodeIds: addedNodes, highlightedEdgeIds: addedEdges }),
    plainAfter: canvasScene("plain", afterNodeIds, afterEdgeIds),
  };
  cache.set(t.id, m);
  return m;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Canvas view while the diagram draws itself: `p` runs 0..1 across all reveal steps. */
export function drawingFrame(m: TopicModels, p: number): FrameState {
  const n = m.drawSteps.length;
  const x = clamp01(p) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const local = x >= n ? 1 : x - i;
  return interpolateFrame(m.canvas, i > 0 ? m.drawSteps[i - 1] : null, m.drawSteps[i], local, { index: 0, total: 1 });
}

/** Canvas view during the AI edit: 0 = before, 1 = after (new parts highlighted). */
export function editFrame(m: TopicModels, p: number): FrameState {
  return interpolateFrame(m.canvas, m.beforeScene, m.afterScene, clamp01(p), { index: 0, total: 1 });
}

/**
 * Presentation view. `p` runs 0..1 across all scenes; each scene spends its
 * first `tween` share transitioning in, then holds (purposeful stillness).
 */
export function presentFrame(model: PresentationModel, scenes: PresentationScene[], p: number, opts: { tween?: number; instant?: boolean } = {}) {
  const tween = opts.tween ?? 0.45;
  const n = scenes.length;
  const x = clamp01(p) * n;
  const index = Math.min(n - 1, Math.floor(x));
  const local = x >= n ? 1 : x - index;
  const t = opts.instant ? 1 : clamp01(local / tween);
  return { index, frame: interpolateFrame(model, index > 0 ? scenes[index - 1] : null, scenes[index], t, { index, total: n }) };
}

export function canvasSvg(m: TopicModels, frame: FrameState, idPrefix: string) {
  return renderFrameSvg(m.canvas, frame, { responsive: true, sketch: true, showCaption: false, showProgress: false, idPrefix });
}

export function stageSvg(model: PresentationModel, frame: FrameState, idPrefix: string, opts: { showCaption?: boolean; showProgress?: boolean } = {}) {
  return renderFrameSvg(model, frame, { responsive: true, idPrefix, ...opts });
}
