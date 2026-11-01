import { beforeEach, describe, expect, it } from "vitest";
import {
  elementIds,
  excalidrawAdapter,
  fromExcalidrawScene,
  getNodeBoxes,
  setAdapterClock,
  syncScene,
  type ExElement,
} from "@/features/excalidraw/adapter";
import { applyPatch } from "@/features/diagrams/services/patch";
import { boxesOverlap } from "@/features/layout";
import { httpDiagram, ragDiagram, sequenceDiagram } from "../fixtures/diagrams";

const byId = (els: ExElement[], id: string) => els.find((e) => e.id === id)!;
const nodeShapes = (els: ExElement[]) => els.filter((e) => e.customData?.dsKind === "node");

describe("Excalidraw adapter: toExcalidrawElements", () => {
  beforeEach(() => setAdapterClock(() => 1_700_000_000_000));

  it("maps node types to native shapes with bound labels", () => {
    const els = excalidrawAdapter.toExcalidrawElements(httpDiagram);
    const browser = byId(els, elementIds.node("browser"));
    const gateway = byId(els, elementIds.node("gateway"));
    expect(browser.type).toBe("ellipse");
    expect(gateway.type).toBe("rectangle");
    const label = byId(els, elementIds.nodeText("gateway"));
    expect(label.type).toBe("text");
    expect(label.containerId).toBe(gateway.id);
    expect(label.originalText).toBe("API Gateway");
    expect(gateway.boundElements!.some((b) => b.id === label.id && b.type === "text")).toBe(true);
  });

  it("maps edges to bound arrows with labels", () => {
    const els = excalidrawAdapter.toExcalidrawElements(httpDiagram);
    const arrow = byId(els, elementIds.edge("edge-1"));
    expect(arrow.type).toBe("arrow");
    expect(arrow.startBinding!.elementId).toBe(elementIds.node("browser"));
    expect(arrow.endBinding!.elementId).toBe(elementIds.node("gateway"));
    expect(arrow.points![0]).toEqual([0, 0]);
    const text = byId(els, elementIds.edgeText("edge-1"));
    expect(text.containerId).toBe(arrow.id);
    expect(byId(els, elementIds.node("browser")).boundElements!.some((b) => b.id === arrow.id)).toBe(true);
  });

  it("only uses supported element properties", () => {
    const allowed = new Set([
      "id", "type", "x", "y", "width", "height", "angle", "strokeColor", "backgroundColor", "fillStyle", "strokeWidth",
      "strokeStyle", "roughness", "opacity", "groupIds", "frameId", "index", "roundness", "seed", "version", "versionNonce",
      "isDeleted", "boundElements", "updated", "link", "locked", "customData", "text", "originalText", "fontSize",
      "fontFamily", "textAlign", "verticalAlign", "containerId", "autoResize", "lineHeight", "points", "lastCommittedPoint",
      "startBinding", "endBinding", "startArrowhead", "endArrowhead", "elbowed",
    ]);
    for (const el of excalidrawAdapter.toExcalidrawElements(ragDiagram)) {
      for (const key of Object.keys(el)) expect(allowed.has(key) ? key : `unsupported:${key}`).toBe(key);
    }
  });

  it("renders groups as a dashed container with a label, behind the nodes", () => {
    const els = excalidrawAdapter.toExcalidrawElements(ragDiagram);
    const rect = byId(els, elementIds.group("retrieval"));
    expect(rect.strokeStyle).toBe("dashed");
    expect(els.indexOf(rect)).toBeLessThan(els.indexOf(byId(els, elementIds.node("retriever"))));
    expect(byId(els, elementIds.groupLabel("retrieval")).text).toBe("Retrieval");
  });

  it("produces non-overlapping node shapes", () => {
    const shapes = nodeShapes(excalidrawAdapter.toExcalidrawElements(ragDiagram));
    for (let i = 0; i < shapes.length; i++)
      for (let j = i + 1; j < shapes.length; j++) expect(boxesOverlap(shapes[i], shapes[j])).toBe(false);
  });

  it("renders sequence diagrams with lifelines and unbound message arrows", () => {
    const els = excalidrawAdapter.toExcalidrawElements(sequenceDiagram);
    expect(els.filter((e) => e.customData?.dsKind === "lifeline")).toHaveLength(3);
    const msg = byId(els, elementIds.edge("m1"));
    expect(msg.startBinding).toBeNull();
    expect(msg.customData!.dsSource).toBe("client");
  });
});

describe("Excalidraw adapter: fromExcalidrawScene", () => {
  it("round-trips the logical structure", () => {
    const els = excalidrawAdapter.toExcalidrawElements(ragDiagram);
    const back = fromExcalidrawScene({ elements: els }, ragDiagram);
    expect(back.nodes.map((n) => [n.id, n.type, n.label])).toEqual(ragDiagram.nodes.map((n) => [n.id, n.type, n.label]));
    expect(back.edges.map((e) => [e.id, e.source, e.target, e.label ?? ""])).toEqual(
      ragDiagram.edges.map((e) => [e.id, e.source, e.target, e.label ?? ""]),
    );
    expect(back.edges.find((e) => e.id === "e8")!.type).toBe("dashed");
    expect(back.groups).toEqual(ragDiagram.groups);
  });

  it("round-trips sequence diagrams via customData endpoints", () => {
    const els = excalidrawAdapter.toExcalidrawElements(sequenceDiagram);
    const back = fromExcalidrawScene({ elements: els }, sequenceDiagram);
    expect(back.edges.map((e) => [e.source, e.target])).toEqual(sequenceDiagram.edges.map((e) => [e.source, e.target]));
  });

  it("picks up label edits made on the canvas", () => {
    const els = excalidrawAdapter.toExcalidrawElements(httpDiagram).map((e) =>
      e.id === elementIds.nodeText("database") ? { ...e, text: "MySQL", originalText: "MySQL" } : e,
    );
    expect(fromExcalidrawScene({ elements: els }, httpDiagram).nodes.find((n) => n.id === "database")!.label).toBe("MySQL");
  });

  it("promotes hand-drawn labelled shapes and bound arrows to nodes/edges", () => {
    const els = excalidrawAdapter.toExcalidrawElements(httpDiagram);
    const userRect: ExElement = { ...byId(els, elementIds.node("service")), id: "user-rect", x: 2000, customData: undefined, boundElements: null };
    const userText: ExElement = { ...byId(els, elementIds.nodeText("service")), id: "user-text", text: "Audit Log", originalText: "Audit Log", containerId: "user-rect", customData: undefined };
    const userArrow: ExElement = {
      ...byId(els, elementIds.edge("edge-1")),
      id: "user-arrow",
      customData: undefined,
      boundElements: null,
      startBinding: { elementId: elementIds.node("service"), focus: 0, gap: 4 },
      endBinding: { elementId: "user-rect", focus: 0, gap: 4 },
    };
    const back = fromExcalidrawScene({ elements: [...els, userRect, userText, userArrow] }, httpDiagram);
    expect(back.nodes.find((n) => n.id === "user-rect")).toMatchObject({ label: "Audit Log", type: "component" });
    expect(back.edges.find((e) => e.id === "user-arrow")).toMatchObject({ source: "service", target: "user-rect" });
  });

  it("ignores deleted elements and unlabeled doodles", () => {
    const els = excalidrawAdapter.toExcalidrawElements(httpDiagram).map((e) =>
      e.id === elementIds.node("gateway") ? { ...e, isDeleted: true } : e,
    );
    const doodle: ExElement = { ...els[0], id: "doodle", type: "ellipse", customData: undefined, boundElements: null };
    const back = fromExcalidrawScene({ elements: [...els, doodle] }, httpDiagram);
    expect(back.nodes.map((n) => n.id)).toEqual(["browser", "service", "database"]);
    expect(back.edges.map((e) => e.id)).toEqual(["edge-3"]);
  });
});

describe("Excalidraw adapter: updateExcalidrawScene", () => {
  beforeEach(() => setAdapterClock(() => 1_700_000_000_000));

  it("is idempotent: repeated syncs never duplicate or bump elements", () => {
    const first = excalidrawAdapter.toExcalidrawElements(ragDiagram);
    const second = syncScene(first, ragDiagram);
    const third = syncScene(second, ragDiagram);
    expect(third).toHaveLength(first.length);
    expect(new Set(third.map((e) => e.id)).size).toBe(third.length);
    expect(third.map((e) => e.version)).toEqual(first.map((e) => e.version));
  });

  it("preserves manual positions and user styling of existing nodes", () => {
    const els = excalidrawAdapter.toExcalidrawElements(httpDiagram).map((e) =>
      e.id === elementIds.node("gateway") ? { ...e, x: e.x + 300, y: e.y + 200, backgroundColor: "#ffc9c9" } : e,
    );
    const { diagram } = applyPatch(httpDiagram, [{ op: "update_node", id: "service", changes: { label: "Orders Service" } }]);
    const next = syncScene(els, diagram);
    const moved = byId(next, elementIds.node("gateway"));
    const original = byId(els, elementIds.node("gateway"));
    expect([moved.x, moved.y, moved.backgroundColor]).toEqual([original.x, original.y, "#ffc9c9"]);
    expect(byId(next, elementIds.nodeText("service")).originalText).toBe("Orders Service");
  });

  it("places new nodes near their neighbours without overlapping", () => {
    const els = excalidrawAdapter.toExcalidrawElements(httpDiagram);
    const { diagram } = applyPatch(httpDiagram, [
      { op: "add_node", node: { id: "redis", type: "cache", label: "Redis" } },
      { op: "remove_edge", id: "edge-3" },
      { op: "add_edge", edge: { source: "service", target: "redis" } },
      { op: "add_edge", edge: { source: "redis", target: "database" } },
    ]);
    const next = syncScene(els, diagram);
    const shapes = nodeShapes(next);
    expect(shapes).toHaveLength(5);
    for (let i = 0; i < shapes.length; i++)
      for (let j = i + 1; j < shapes.length; j++) expect(boxesOverlap(shapes[i], shapes[j])).toBe(false);
    for (const id of ["browser", "gateway", "service", "database"]) {
      expect(byId(next, elementIds.node(id)).x).toBe(byId(els, elementIds.node(id)).x);
    }
    const redis = byId(next, elementIds.node("redis"));
    const service = byId(next, elementIds.node("service"));
    expect(Math.abs(redis.x - service.x)).toBeLessThan(800);
    expect(next.some((e) => e.id === elementIds.edge("edge-3"))).toBe(false);
    expect(next.some((e) => e.id === elementIds.edgeText("edge-3"))).toBe(false);
  });

  it("removes nodes with their labels and arrows, and unbinds user arrows", () => {
    const els = excalidrawAdapter.toExcalidrawElements(httpDiagram);
    const userArrow: ExElement = {
      ...byId(els, elementIds.edge("edge-1")),
      id: "freehand-arrow",
      customData: undefined,
      boundElements: null,
      startBinding: { elementId: elementIds.node("gateway"), focus: 0, gap: 4 },
      endBinding: null,
    };
    const { diagram } = applyPatch(httpDiagram, [{ op: "remove_node", id: "gateway" }]);
    const next = syncScene([...els, userArrow], diagram);
    expect(next.some((e) => e.id === elementIds.node("gateway"))).toBe(false);
    expect(next.some((e) => e.id === elementIds.nodeText("gateway"))).toBe(false);
    expect(next.some((e) => e.id === elementIds.edge("edge-1"))).toBe(false);
    expect(byId(next, "freehand-arrow").startBinding).toBeNull();
  });

  it("keeps unrelated user drawings untouched", () => {
    const els = excalidrawAdapter.toExcalidrawElements(httpDiagram);
    const sketch: ExElement = { ...els[0], id: "sketch", type: "freedraw", customData: undefined, boundElements: null, x: -500 };
    const next = syncScene([...els, sketch], applyPatch(httpDiagram, [{ op: "set_title", title: "X" }]).diagram);
    expect(byId(next, "sketch")).toEqual(sketch);
  });

  it("keeps arrow geometry when endpoints did not move, reroutes when they did", () => {
    const els = excalidrawAdapter.toExcalidrawElements(httpDiagram);
    const same = syncScene(els, httpDiagram);
    expect(byId(same, elementIds.edge("edge-1")).points).toEqual(byId(els, elementIds.edge("edge-1")).points);
    const moved = els.map((e) => (e.id === elementIds.node("gateway") ? { ...e, y: e.y + 400 } : e));
    const next = syncScene(moved, httpDiagram);
    const arrow = byId(next, elementIds.edge("edge-1"));
    expect(arrow.version).toBeGreaterThan(byId(els, elementIds.edge("edge-1")).version);
    const endY = arrow.y + arrow.points![arrow.points!.length - 1][1];
    const gw = byId(next, elementIds.node("gateway"));
    expect(endY).toBeGreaterThan(gw.y - 20);
  });

  it("applies and removes highlights, restoring the user's stroke", () => {
    const els = excalidrawAdapter.toExcalidrawElements(httpDiagram).map((e) =>
      e.id === elementIds.node("gateway") ? { ...e, strokeColor: "#5f3dc4" } : e,
    );
    const hi = applyPatch(httpDiagram, [{ op: "update_node", id: "gateway", changes: { highlight: true } }]).diagram;
    const on = syncScene(els, hi);
    expect(byId(on, elementIds.node("gateway")).strokeColor).toBe("#e03131");
    expect(fromExcalidrawScene({ elements: on }, hi).nodes.find((n) => n.id === "gateway")!.style?.highlight).toBe(true);
    const off = syncScene(on, applyPatch(hi, [{ op: "update_node", id: "gateway", changes: { highlight: false } }]).diagram);
    expect(byId(off, elementIds.node("gateway")).strokeColor).toBe("#5f3dc4");
  });

  it("changes shape when the node type changes", () => {
    const els = excalidrawAdapter.toExcalidrawElements(httpDiagram);
    const d = applyPatch(httpDiagram, [{ op: "update_node", id: "service", changes: { type: "decision" } }]).diagram;
    const next = syncScene(els, d);
    expect(byId(next, elementIds.node("service")).type).toBe("diamond");
    expect(byId(next, elementIds.node("service")).backgroundColor).toBe("#ffd8a8");
  });

  it("re-lays out everything only when explicitly requested", () => {
    const els = excalidrawAdapter.toExcalidrawElements(httpDiagram).map((e) =>
      e.id === elementIds.node("gateway") ? { ...e, x: 5000 } : e,
    );
    const tb = applyPatch(httpDiagram, [{ op: "set_layout", layout: "top-to-bottom" }]).diagram;
    expect(byId(syncScene(els, tb), elementIds.node("gateway")).x).toBe(5000);
    const relaid = syncScene(els, tb, { relayout: true });
    const boxes = getNodeBoxes(relaid);
    expect(boxes.gateway.x).toBeLessThan(5000);
    expect(boxes.browser.y).toBeLessThan(boxes.gateway.y);
  });

  it("updates group containers to fit moved members", () => {
    const els = excalidrawAdapter.toExcalidrawElements(ragDiagram).map((e) =>
      e.id === elementIds.node("vectordb") ? { ...e, y: e.y + 600 } : e,
    );
    const next = syncScene(els, ragDiagram);
    const g = byId(next, elementIds.group("retrieval"));
    const v = byId(next, elementIds.node("vectordb"));
    expect(g.y + g.height).toBeGreaterThan(v.y + v.height);
  });
});
