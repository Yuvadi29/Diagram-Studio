import { describe, expect, it } from "vitest";
import { DiagramDSLSchema } from "@/features/diagrams/schema/dsl";
import { repairAndValidate, sanitizeDiagram, slugifyId, validateDiagram } from "@/features/diagrams/validation/sanitize";
import { httpDiagram, ragDiagram } from "../fixtures/diagrams";

describe("DiagramDSL schema", () => {
  it("accepts valid diagrams", () => {
    expect(DiagramDSLSchema.safeParse(httpDiagram).success).toBe(true);
    expect(DiagramDSLSchema.safeParse(ragDiagram).success).toBe(true);
  });

  it("rejects duplicate node ids", () => {
    const bad = { ...httpDiagram, nodes: [...httpDiagram.nodes, { id: "browser", type: "actor", label: "Dup" }] };
    const r = validateDiagram(bad);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.join(" ")).toMatch(/Duplicate node id "browser"/);
  });

  it("rejects duplicate edge ids", () => {
    const bad = { ...httpDiagram, edges: [...httpDiagram.edges, { id: "edge-1", source: "browser", target: "service" }] };
    const r = validateDiagram(bad);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.join(" ")).toMatch(/Duplicate edge id/);
  });

  it("rejects edges with missing source or target", () => {
    const bad = { ...httpDiagram, edges: [{ id: "x", source: "browser", target: "nope" }] };
    const r = validateDiagram(bad);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.join(" ")).toMatch(/target "nope" does not exist/);
  });

  it("rejects missing group references", () => {
    const bad = { ...httpDiagram, nodes: httpDiagram.nodes.map((n, i) => (i === 0 ? { ...n, groupId: "ghost" } : n)) };
    expect(validateDiagram(bad).success).toBe(false);
    const bad2 = { ...httpDiagram, groups: [{ id: "g", label: "G", nodeIds: ["ghost"] }] };
    expect(validateDiagram(bad2).success).toBe(false);
  });

  it("requires labels and valid types", () => {
    expect(validateDiagram({ ...httpDiagram, nodes: [{ id: "a", type: "actor", label: "  " }], edges: [] }).success).toBe(false);
    expect(validateDiagram({ ...httpDiagram, type: "mindmap" }).success).toBe(false);
    expect(validateDiagram({ ...httpDiagram, nodes: [{ id: "a", type: "robot", label: "A" }], edges: [] }).success).toBe(false);
  });

  it("enforces node count limits", () => {
    const nodes = Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, type: "service" as const, label: `N${i}` }));
    expect(validateDiagram({ ...httpDiagram, nodes, edges: [] }).success).toBe(false);
  });
});

describe("sanitizeDiagram (deterministic repair)", () => {
  it("normalises ids, types and layout synonyms", () => {
    const { diagram, warnings } = sanitizeDiagram({
      title: "Messy",
      type: "System Architecture",
      layout: "LR",
      nodes: [
        { id: "User Browser", type: "user", label: "Browser" },
        { id: "db", type: "DB", label: "Postgres" },
        { label: "Mystery", type: "spaceship" },
      ],
      edges: [{ source: "User Browser", target: "db", label: "query", type: "dotted" }],
    });
    expect(diagram.type).toBe("architecture");
    expect(diagram.layout).toBe("left-to-right");
    expect(diagram.nodes.map((n) => n.id)).toEqual(["user-browser", "db", "mystery"]);
    expect(diagram.nodes.map((n) => n.type)).toEqual(["actor", "database", "component"]);
    expect(diagram.edges[0]).toMatchObject({ source: "user-browser", target: "db", type: "dashed" });
    expect(warnings.some((w) => w.includes("spaceship"))).toBe(true);
  });

  it("drops dangling edges and resolves label references", () => {
    const { diagram, warnings } = sanitizeDiagram({
      nodes: [
        { id: "a", label: "Alpha" },
        { id: "b", label: "Beta" },
      ],
      edges: [
        { source: "Alpha", target: "Beta" },
        { source: "a", target: "zzz" },
      ],
    });
    expect(diagram.edges).toHaveLength(1);
    expect(diagram.edges[0]).toMatchObject({ source: "a", target: "b" });
    expect(warnings.some((w) => w.includes("does not exist"))).toBe(true);
  });

  it("dedupes ids and reconciles groups in both directions", () => {
    const { diagram } = sanitizeDiagram({
      nodes: [
        { id: "x", label: "X", groupId: "core" },
        { id: "x", label: "X2" },
        { id: "y", label: "Y" },
      ],
      edges: [],
      groups: [
        { id: "core", label: "Core", nodeIds: ["y"] },
        { id: "empty", label: "Empty", nodeIds: [] },
      ],
    });
    expect(diagram.nodes.map((n) => n.id)).toEqual(["x", "x-2", "y"]);
    expect(diagram.groups).toHaveLength(1);
    expect(diagram.groups![0].nodeIds.sort()).toEqual(["x", "y"]);
    expect(diagram.nodes.find((n) => n.id === "y")!.groupId).toBe("core");
    expect(validateDiagram(diagram).success).toBe(true);
  });

  it("converts null optional values into absent ones", () => {
    const r = repairAndValidate({
      title: "T",
      type: "flowchart",
      nodes: [{ id: "a", type: "process", label: "A", description: null, groupId: "" }],
      edges: [],
      groups: null,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.diagram.nodes[0].groupId).toBeUndefined();
      expect(r.diagram.nodes[0].description).toBeUndefined();
    }
  });

  it("slugifies safely", () => {
    expect(slugifyId("API Gateway (v2)")).toBe("api-gateway-v2");
    expect(slugifyId("!!!")).toBe("item");
  });
});
