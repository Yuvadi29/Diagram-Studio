import { describe, expect, it } from "vitest";
import { applyPatch, RefinementResponseSchema } from "@/features/diagrams/services/patch";
import { diffDiagrams, isEmptyDiff, summarizeDiff } from "@/features/diagrams/services/diff";
import { httpDiagram, ragDiagram } from "../fixtures/diagrams";

describe("applyPatch", () => {
  it("adds Redis between the service and the database without touching other nodes", () => {
    const { diagram, skipped } = applyPatch(httpDiagram, [
      { op: "add_node", node: { id: "redis", type: "cache", label: "Redis" } },
      { op: "remove_edge", id: "edge-3" },
      { op: "add_edge", edge: { source: "service", target: "redis", label: "Cache lookup" } },
      { op: "add_edge", edge: { source: "redis", target: "database", label: "Cache miss" } },
    ]);
    expect(skipped).toHaveLength(0);
    expect(diagram.nodes.map((n) => n.id)).toEqual(["browser", "gateway", "service", "database", "redis"]);
    expect(diagram.edges.find((e) => e.id === "edge-1")).toEqual(httpDiagram.edges[0]);
    expect(diagram.edges.some((e) => e.id === "edge-3")).toBe(false);
    expect(diagram.version).toBe(2);
  });

  it("removing a node removes its connections", () => {
    const { diagram } = applyPatch(httpDiagram, [{ op: "remove_node", id: "gateway" }]);
    expect(diagram.nodes.some((n) => n.id === "gateway")).toBe(false);
    expect(diagram.edges.map((e) => e.id)).toEqual(["edge-3"]);
  });

  it("resolves nodes by label and skips unknown targets", () => {
    const { diagram, skipped } = applyPatch(httpDiagram, [
      { op: "update_node", id: "API Gateway", changes: { highlight: true } },
      { op: "update_node", id: "nonexistent", changes: { label: "X" } },
    ]);
    expect(diagram.nodes.find((n) => n.id === "gateway")!.style?.highlight).toBe(true);
    expect(skipped).toHaveLength(1);
  });

  it("changes layout direction and reports it", () => {
    const r = applyPatch(httpDiagram, [{ op: "set_layout", layout: "vertical" }]);
    expect(r.diagram.layout).toBe("top-to-bottom");
    expect(r.layoutChanged).toBe(true);
  });

  it("manages groups", () => {
    const r = applyPatch(httpDiagram, [{ op: "add_group", group: { label: "Backend", nodeIds: ["service", "database"] } }]);
    expect(r.diagram.groups).toHaveLength(1);
    expect(r.diagram.nodes.find((n) => n.id === "service")!.groupId).toBe("backend");
    const r2 = applyPatch(r.diagram, [{ op: "remove_group", id: "backend" }]);
    expect(r2.diagram.groups).toHaveLength(0);
    expect(r2.diagram.nodes.find((n) => n.id === "service")!.groupId).toBeUndefined();
  });

  it("does not create duplicate edges", () => {
    const r = applyPatch(httpDiagram, [{ op: "add_edge", edge: { source: "browser", target: "gateway", label: "HTTP Request" } }]);
    expect(r.diagram.edges).toHaveLength(3);
    expect(r.skipped).toHaveLength(1);
  });

  it("parses loose LLM refinement output", () => {
    const parsed = RefinementResponseSchema.parse({
      kind: "patch",
      summary: "Add queue",
      operations: [{ op: "add_node", id: null, node: { label: "Kafka", type: "queue", description: "" } }],
    });
    expect(parsed.operations![0].node!.description).toBeUndefined();
  });
});

describe("diffDiagrams", () => {
  it("summarises changes", () => {
    const { diagram } = applyPatch(ragDiagram, [
      { op: "add_node", node: { label: "Reranker", type: "process" } },
      { op: "update_node", id: "llm", changes: { label: "GPT" } },
      { op: "remove_edge", id: "e8" },
    ]);
    const d = diffDiagrams(ragDiagram, diagram);
    expect(d.addedNodes.map((n) => n.label)).toEqual(["Reranker"]);
    expect(d.updatedNodes[0].fields).toEqual(["label"]);
    expect(d.removedEdges.map((e) => e.id)).toEqual(["e8"]);
    expect(summarizeDiff(d)).toMatch(/Added Reranker/);
    expect(isEmptyDiff(diffDiagrams(ragDiagram, ragDiagram))).toBe(true);
  });
});
