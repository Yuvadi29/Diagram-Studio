import { describe, expect, it } from "vitest";
import { boxesOverlap, computeLayout } from "@/features/layout";
import { httpDiagram, ragDiagram, sequenceDiagram } from "../fixtures/diagrams";

function noOverlaps(boxes: { x: number; y: number; width: number; height: number }[]) {
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (boxesOverlap(boxes[i], boxes[j])) return false;
  return true;
}

describe("layout engine", () => {
  it("positions every node without overlaps (left-to-right)", () => {
    const l = computeLayout(ragDiagram);
    expect(Object.keys(l.nodes).sort()).toEqual(ragDiagram.nodes.map((n) => n.id).sort());
    expect(noOverlaps(Object.values(l.nodes))).toBe(true);
    expect(l.direction).toBe("LR");
  });

  it("flows left-to-right and top-to-bottom", () => {
    const lr = computeLayout(httpDiagram);
    expect(lr.nodes.browser.x).toBeLessThan(lr.nodes.gateway.x);
    expect(lr.nodes.gateway.x).toBeLessThan(lr.nodes.service.x);
    const tb = computeLayout({ ...httpDiagram, layout: "top-to-bottom" });
    expect(tb.direction).toBe("TB");
    expect(tb.nodes.browser.y).toBeLessThan(tb.nodes.gateway.y);
    expect(tb.nodes.gateway.y).toBeLessThan(tb.nodes.service.y);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(computeLayout(ragDiagram))).toBe(JSON.stringify(computeLayout(ragDiagram)));
  });

  it("uses consistent node sizes and routes every edge", () => {
    const l = computeLayout(ragDiagram);
    for (const b of Object.values(l.nodes)) {
      expect(b.width).toBeGreaterThanOrEqual(120);
      expect(b.height).toBeGreaterThanOrEqual(60);
    }
    for (const e of ragDiagram.edges) expect(l.edges[e.id].points.length).toBeGreaterThanOrEqual(2);
  });

  it("wraps groups around their members", () => {
    const l = computeLayout(ragDiagram);
    const g = l.groups.retrieval;
    for (const id of ["embedder", "retriever", "vectordb"]) {
      const b = l.nodes[id];
      expect(b.x).toBeGreaterThan(g.x);
      expect(b.y).toBeGreaterThan(g.y);
      expect(b.x + b.width).toBeLessThan(g.x + g.width);
      expect(b.y + b.height).toBeLessThan(g.y + g.height);
    }
  });

  it("lays out sequence diagrams with lifelines and ordered messages", () => {
    const l = computeLayout(sequenceDiagram);
    expect(l.nodes.client.y).toBe(l.nodes.api.y);
    expect(Object.keys(l.lifelines!)).toHaveLength(3);
    const ys = sequenceDiagram.edges.map((e) => l.edges[e.id].points[0][1]);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
  });

  it("makes compact layouts smaller", () => {
    const a = computeLayout(ragDiagram, { direction: "TB" });
    const b = computeLayout(ragDiagram, { direction: "TB", compact: true });
    expect(b.bounds.height).toBeLessThan(a.bounds.height);
  });
});
