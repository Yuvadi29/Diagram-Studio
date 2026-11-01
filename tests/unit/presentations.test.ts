import { describe, expect, it } from "vitest";
import {
  autoGenerateScenes,
  buildPresentationModel,
  computeViewBox,
  DEFAULT_FORMATS,
  effectiveVisibleEdges,
  frameAtTime,
  interpolateFrame,
  locate,
  moveNodeInFormat,
  PresentationSceneSchema,
  reconcileScenes,
  regenerateFormatLayout,
  renderFrameSvg,
  reorderScenes,
  resolvePositions,
  sceneVisuals,
  staticFrame,
  suggestPositions,
  totalDurationMs,
  type PresentationScene,
} from "@/features/presentations";
import { boxesOverlap } from "@/features/layout";
import { applyPatch } from "@/features/diagrams/services/patch";
import { ragDiagram, sequenceDiagram } from "../fixtures/diagrams";

const scene = (over: Partial<PresentationScene> = {}): PresentationScene => ({
  id: "s1",
  title: "Scene",
  order: 0,
  visibleNodeIds: ["user", "app"],
  visibleEdgeIds: ["e1"],
  durationMs: 4000,
  transition: { type: "fade", durationMs: 600 },
  ...over,
});

describe("scenes", () => {
  it("auto-generates progressive scenes that reference real elements", () => {
    const scenes = autoGenerateScenes(ragDiagram);
    expect(scenes.length).toBeGreaterThanOrEqual(3);
    expect(scenes.length).toBeLessThanOrEqual(8);
    const nodeIds = new Set(ragDiagram.nodes.map((n) => n.id));
    const edgeIds = new Set(ragDiagram.edges.map((e) => e.id));
    for (const s of scenes) {
      expect(PresentationSceneSchema.safeParse(s).success).toBe(true);
      for (const id of s.visibleNodeIds) expect(nodeIds.has(id)).toBe(true);
      for (const id of s.visibleEdgeIds) expect(edgeIds.has(id)).toBe(true);
    }
    // Reveal is cumulative and the last scene shows everything.
    for (let i = 1; i < scenes.length; i++) expect(scenes[i].visibleNodeIds.length).toBeGreaterThanOrEqual(scenes[i - 1].visibleNodeIds.length);
    expect(scenes[scenes.length - 1].visibleNodeIds.length).toBe(ragDiagram.nodes.length);
    expect(scenes.map((s) => s.order)).toEqual(scenes.map((_, i) => i));
  });

  it("reconciles scenes after diagram changes", () => {
    const s = scene({ visibleNodeIds: ["user", "ghost"], highlightedNodeIds: ["app"], visibleEdgeIds: ["e1", "zz"], order: 5 });
    const { scenes, warnings } = reconcileScenes([s], ragDiagram);
    expect(scenes[0].visibleNodeIds.sort()).toEqual(["app", "user"]);
    expect(scenes[0].visibleEdgeIds).toEqual(["e1"]);
    expect(scenes[0].order).toBe(0);
    expect(warnings.length).toBe(2);
  });

  it("reorders scenes and keeps order dense", () => {
    const list = [scene({ id: "a", order: 0 }), scene({ id: "b", order: 1 }), scene({ id: "c", order: 2 })];
    const out = reorderScenes(list, 2, 0);
    expect(out.map((s) => s.id)).toEqual(["c", "a", "b"]);
    expect(out.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it("only shows edges whose endpoints are visible", () => {
    const vis = effectiveVisibleEdges(scene({ visibleNodeIds: ["user"], visibleEdgeIds: ["e1"] }), ragDiagram);
    expect(vis.size).toBe(0);
  });
});

describe("presentation formats", () => {
  it("landscape mirrors the editor; portrait gets an independent vertical layout", () => {
    const editor = Object.fromEntries(ragDiagram.nodes.map((n, i) => [n.id, { x: i * 250, y: 0, width: 180, height: 72 }]));
    const land = suggestPositions(ragDiagram, "landscape", editor);
    expect(land.source).toBe("editor");
    expect(land.positions.app.x).toBe(250);
    const port = suggestPositions(ragDiagram, "portrait", editor);
    expect(port.source).toBe("auto");
    const ys = Object.values(port.positions).map((b) => b.y);
    const xs = Object.values(port.positions).map((b) => b.x);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(Math.max(...xs) - Math.min(...xs));
  });

  it("shares logical ids across formats", () => {
    const l = buildPresentationModel(ragDiagram, "landscape", DEFAULT_FORMATS.landscape);
    const p = buildPresentationModel(ragDiagram, "portrait", DEFAULT_FORMATS.portrait);
    expect(l.nodes.map((n) => n.id)).toEqual(p.nodes.map((n) => n.id));
    expect(l.edges.map((e) => e.id)).toEqual(p.edges.map((e) => e.id));
    expect(l.width / l.height).toBe(16 / 9);
    expect(p.width / p.height).toBe(9 / 16);
  });

  it("preserves manual adjustments when regenerating, unless told otherwise", () => {
    const base = regenerateFormatLayout(ragDiagram, "portrait", DEFAULT_FORMATS.portrait);
    const all = resolvePositions(ragDiagram, "portrait", base);
    const moved = moveNodeInFormat(base, "llm", { x: 9999, y: 9999, width: 150, height: 72 }, all);
    expect(moved.manualNodeIds).toEqual(["llm"]);
    const regen = regenerateFormatLayout(ragDiagram, "portrait", moved);
    expect(regen.positions!.llm.x).toBe(9999);
    const reset = regenerateFormatLayout(ragDiagram, "portrait", moved, undefined, { discardManual: true });
    expect(reset.positions!.llm.x).not.toBe(9999);
  });

  it("places nodes added after layout without moving stored ones", () => {
    const cfg = regenerateFormatLayout(ragDiagram, "landscape", DEFAULT_FORMATS.landscape);
    const { diagram } = applyPatch(ragDiagram, [
      { op: "add_node", node: { id: "reranker", label: "Reranker", type: "process" } },
      { op: "add_edge", edge: { source: "retriever", target: "reranker" } },
    ]);
    const pos = resolvePositions(diagram, "landscape", cfg);
    expect(pos.user).toEqual(cfg.positions!.user);
    expect(pos.reranker).toBeDefined();
    for (const [id, b] of Object.entries(pos)) if (id !== "reranker") expect(boxesOverlap(b, pos.reranker, 10)).toBe(false);
  });
});

describe("playback", () => {
  const model = buildPresentationModel(ragDiagram, "landscape", DEFAULT_FORMATS.landscape);

  it("computes scene visibility, highlight and dimming", () => {
    const v = sceneVisuals(model, scene({ visibleNodeIds: ["user", "app", "llm"], highlightedNodeIds: ["app"], dimmedNodeIds: ["llm"] }));
    expect(v.nodes.user.opacity).toBeGreaterThan(0);
    expect(v.nodes.app.highlight).toBe(1);
    expect(v.nodes.llm.opacity).toBeLessThan(0.5);
    expect(v.nodes.retriever.opacity).toBe(0);
    expect(v.edges.e1.opacity).toBe(1);
    expect(v.edges.e6.opacity).toBe(0);
  });

  it("frames the camera to the stage aspect ratio", () => {
    const vb = computeViewBox(model, scene());
    expect(Math.abs(vb.width / vb.height - model.stage.width / model.stage.height)).toBeLessThan(0.01);
    const all = computeViewBox(model, scene({ cameraByFormat: { landscape: { mode: "all" } } }));
    expect(all.width).toBeGreaterThan(vb.width);
  });

  it("interpolates transitions and reveals edges after nodes", () => {
    const from = scene({ visibleNodeIds: ["user"], visibleEdgeIds: [] });
    const to = scene({ id: "s2", visibleNodeIds: ["user", "app"], visibleEdgeIds: ["e1"] });
    const start = interpolateFrame(model, from, to, 0, { index: 1, total: 2 });
    const mid = interpolateFrame(model, from, to, 0.5, { index: 1, total: 2 });
    const end = interpolateFrame(model, from, to, 1, { index: 1, total: 2 });
    expect(start.nodes.app.opacity).toBe(0);
    expect(mid.nodes.app.opacity).toBeGreaterThan(0);
    expect(mid.edges.e1.draw).toBeLessThan(mid.nodes.app.opacity);
    expect(end.nodes.app.opacity).toBe(1);
    expect(end.edges.e1.draw).toBe(1);
    const none = interpolateFrame(model, from, { ...to, transition: { type: "none", durationMs: 0 } }, 0, { index: 1, total: 2 });
    expect(none.nodes.app.opacity).toBe(1);
  });

  it("locates scenes on the timeline deterministically", () => {
    const scenes = autoGenerateScenes(ragDiagram);
    const total = totalDurationMs(scenes);
    expect(locate(scenes, 0).index).toBe(0);
    expect(locate(scenes, scenes[0].durationMs + 1).index).toBe(1);
    expect(locate(scenes, total + 5000).index).toBe(scenes.length - 1);
    expect(JSON.stringify(frameAtTime(model, scenes, 1234))).toBe(JSON.stringify(frameAtTime(model, scenes, 1234)));
  });
});

describe("svg renderer", () => {
  it("renders every visible element and escapes text", () => {
    const d = { ...ragDiagram, nodes: ragDiagram.nodes.map((n) => (n.id === "llm" ? { ...n, label: "LLM <GPT & co>" } : n)) };
    const model = buildPresentationModel(d, "portrait", DEFAULT_FORMATS.portrait);
    const svg = renderFrameSvg(model, staticFrame(model, null));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 1080 1920"');
    expect(svg).toContain("LLM &lt;GPT &amp; co&gt;");
    for (const n of d.nodes) expect(svg).toContain(`data-node-id="${n.id}"`);
    expect(svg).not.toContain("NaN");
  });

  it("hides elements that are not in the scene", () => {
    const model = buildPresentationModel(ragDiagram, "landscape", DEFAULT_FORMATS.landscape);
    const svg = renderFrameSvg(model, staticFrame(model, scene()));
    expect(svg).toContain('data-node-id="user"');
    expect(svg).not.toContain('data-node-id="llm"');
  });

  it("renders sequence diagrams with lifelines", () => {
    const model = buildPresentationModel(sequenceDiagram, "landscape", DEFAULT_FORMATS.landscape);
    expect(model.lifelines).toHaveLength(3);
    const svg = renderFrameSvg(model, staticFrame(model, null));
    expect(svg).toContain("Verify signature");
    expect(svg).not.toContain("NaN");
  });
});

describe("svg renderer options", () => {
  it("supports unique id prefixes, sketch mode and font overrides", () => {
    const model = buildPresentationModel(ragDiagram, "landscape", DEFAULT_FORMATS.landscape);
    const svg = renderFrameSvg(model, staticFrame(model, null), { idPrefix: "hero", sketch: true, fontFamily: "Kalam, cursive" });
    expect(svg).toContain('id="hero-arrow"');
    expect(svg).toContain("url(#hero-rough)");
    expect(svg).not.toContain('id="ds-');
    expect(svg).toContain('font-family="Kalam, cursive"');
    const plain = renderFrameSvg(model, staticFrame(model, null));
    expect(plain).not.toContain("rough");
    expect(plain).toContain('id="ds-arrow"');
  });
});
