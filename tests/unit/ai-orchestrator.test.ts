import { describe, expect, it } from "vitest";
import { createDiagramAI } from "@/features/ai/orchestrator/diagram-ai";
import { extractJson } from "@/features/ai/orchestrator/structured";
import { AIError, type LLMClient, type LLMRequest } from "@/features/ai/providers/types";
import { httpDiagram, ragDiagram } from "../fixtures/diagrams";

/** Scripted fake LLM: returns queued responses and records prompts. */
function fakeLLM(responses: (string | object)[]): LLMClient & { prompts: LLMRequest[] } {
  const queue = [...responses];
  const prompts: LLMRequest[] = [];
  return {
    provider: "gemini",
    model: "fake-model",
    prompts,
    async completeJSON(req) {
      prompts.push(req);
      const next = queue.shift();
      if (next === undefined) throw new Error("no more scripted responses");
      return { text: typeof next === "string" ? next : JSON.stringify(next), usage: { inputTokens: 10, outputTokens: 5 }, model: "fake-model" };
    },
  };
}

describe("extractJson", () => {
  it("handles fences and surrounding prose", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! Here it is: {"a":2} hope that helps')).toEqual({ a: 2 });
    expect(() => extractJson("nope")).toThrow();
  });
});

describe("generateDiagram", () => {
  it("returns a validated diagram with the requested id", async () => {
    const llm = fakeLLM([{ ...httpDiagram, id: undefined }]);
    const ai = createDiagramAI(llm);
    const r = await ai.generateDiagram("browser to postgres", { diagramId: "d-123" });
    expect(r.value.id).toBe("d-123");
    expect(r.value.nodes).toHaveLength(4);
    expect(r.usage.inputTokens).toBe(10);
    expect(llm.prompts[0].schema).toBeDefined();
  });

  it("repairs malformed JSON by feeding errors back to the model", async () => {
    const llm = fakeLLM(["this is not json", httpDiagram]);
    const r = await createDiagramAI(llm).generateDiagram("x");
    expect(r.value.nodes).toHaveLength(4);
    expect(llm.prompts).toHaveLength(2);
    expect(llm.prompts[1].prompt).toContain("previous response was invalid");
    expect(r.usage.inputTokens).toBe(20);
  });

  it("asks for a repair on dangling references, falls back to the sanitised result", async () => {
    const bad = { ...httpDiagram, edges: [...httpDiagram.edges, { id: "x", source: "service", target: "redis" }] };
    const llm = fakeLLM([bad, bad]);
    const r = await createDiagramAI(llm).generateDiagram("x");
    expect(llm.prompts).toHaveLength(2);
    expect(r.value.edges).toHaveLength(3);
    expect(r.warnings.some((w) => w.includes("does not exist"))).toBe(true);
  });

  it("rejects output that stays invalid", async () => {
    const llm = fakeLLM([{ nodes: [] }, { nodes: [] }]);
    await expect(createDiagramAI(llm).generateDiagram("x")).rejects.toThrow(/invalid result/);
  });

  it("rejects empty prompts", async () => {
    await expect(createDiagramAI(fakeLLM([])).generateDiagram("  ")).rejects.toThrow(/Describe/);
  });
});

describe("refineDiagram", () => {
  it("applies a structured patch, preserving untouched elements", async () => {
    const llm = fakeLLM([
      {
        kind: "patch",
        summary: "Added Redis",
        operations: [
          { op: "add_node", node: { id: "redis", type: "cache", label: "Redis" } },
          { op: "remove_edge", id: "edge-3" },
          { op: "add_edge", edge: { source: "service", target: "redis" } },
          { op: "add_edge", edge: { source: "redis", target: "database" } },
        ],
      },
    ]);
    const r = await createDiagramAI(llm).refineDiagram(httpDiagram, "Add Redis between the API and database");
    expect(r.value.kind).toBe("patch");
    if (r.value.kind === "patch") {
      expect(r.value.diagram.nodes.map((n) => n.id)).toContain("redis");
      expect(r.value.diagram.nodes.slice(0, 4)).toEqual(httpDiagram.nodes);
      expect(r.value.summary).toBe("Added Redis");
    }
    expect(llm.prompts[0].prompt).toContain('"id":"gateway"');
  });

  it("passes clarification questions through", async () => {
    const r = await createDiagramAI(fakeLLM([{ kind: "clarify", question: "Which service?" }])).refineDiagram(ragDiagram, "remove the service");
    expect(r.value).toEqual({ kind: "clarify", question: "Which service?" });
  });

  it("answers explanations without changing the diagram", async () => {
    const llm = fakeLLM([{ kind: "explain", answer: "The gateway routes requests." }]);
    const r = await createDiagramAI(llm).refineDiagram(httpDiagram, "Explain the selected component", { selectedNodeIds: ["gateway"] });
    expect(r.value.kind).toBe("explain");
    expect(llm.prompts[0].prompt).toContain("gateway (API Gateway)");
  });

  it("retries when the patch does nothing", async () => {
    const llm = fakeLLM([
      { kind: "patch", operations: [{ op: "update_node", id: "ghost", changes: { label: "X" } }] },
      { kind: "patch", operations: [{ op: "update_node", id: "gateway", changes: { label: "Edge Gateway" } }] },
    ]);
    const r = await createDiagramAI(llm).refineDiagram(httpDiagram, "rename gateway");
    expect(llm.prompts).toHaveLength(2);
    if (r.value.kind === "patch") expect(r.value.diagram.nodes[1].label).toBe("Edge Gateway");
  });
});

describe("generateScenes", () => {
  it("builds valid scenes and strips invented ids", async () => {
    const scenesOut = {
      scenes: [
        { title: "The question", visibleNodeIds: ["user", "app"], visibleEdgeIds: ["e1"], highlightedNodeIds: ["user"], transition: "fade" },
        { title: "Retrieval", visibleNodeIds: ["user", "app", "retriever", "made-up"], visibleEdgeIds: ["e1"], durationMs: 99999 },
      ],
    };
    const llm = fakeLLM([scenesOut, scenesOut]);
    const r = await createDiagramAI(llm).generateScenes(ragDiagram);
    expect(llm.prompts).toHaveLength(2); // one repair attempt for the invented id
    expect(r.value).toHaveLength(2);
    expect(r.value[1].visibleNodeIds).not.toContain("made-up");
    expect(r.value[1].durationMs).toBe(20000);
    expect(r.value.map((s) => s.order)).toEqual([0, 1]);
  });

  it("refuses empty diagrams", async () => {
    await expect(createDiagramAI(fakeLLM([])).generateScenes({ ...ragDiagram, nodes: [], edges: [], groups: [] })).rejects.toThrow(/empty/);
  });
});

describe("AIError", () => {
  it("carries a code", () => {
    const e = new AIError("TIMEOUT", "slow", { retryable: true });
    expect(e.code).toBe("TIMEOUT");
    expect(e.retryable).toBe(true);
  });
});
