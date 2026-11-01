import type { DiagramDSL } from "@/features/diagrams/schema/dsl";
import type { PresentationScene } from "@/features/presentations";

/** The RAG demo scenario (PRD §21), used by the landing page's live demos. */
export const RAG_DEMO: DiagramDSL = {
  id: "demo-rag",
  title: "RAG architecture",
  description: "How retrieval-augmented generation grounds an LLM answer in your own documents.",
  type: "architecture",
  layout: "left-to-right",
  version: 1,
  nodes: [
    { id: "user", type: "actor", label: "User" },
    { id: "app", type: "service", label: "Application" },
    { id: "embedder", type: "component", label: "Embedding model", groupId: "retrieval" },
    { id: "retriever", type: "process", label: "Retriever", groupId: "retrieval" },
    { id: "vectordb", type: "database", label: "Vector database", groupId: "retrieval" },
    { id: "augment", type: "process", label: "Context augmentation" },
    { id: "llm", type: "component", label: "LLM" },
    { id: "response", type: "process", label: "Response" },
  ],
  edges: [
    { id: "e1", source: "user", target: "app", label: "Question" },
    { id: "e2", source: "app", target: "embedder", label: "Embed query" },
    { id: "e3", source: "embedder", target: "retriever", label: "Query vector" },
    { id: "e4", source: "retriever", target: "vectordb", label: "Similarity search" },
    { id: "e5", source: "retriever", target: "augment", label: "Top-k chunks" },
    { id: "e6", source: "augment", target: "llm", label: "Prompt + context" },
    { id: "e7", source: "llm", target: "response" },
    { id: "e8", source: "response", target: "user", type: "dashed" },
  ],
  groups: [{ id: "retrieval", label: "Retrieval", nodeIds: ["embedder", "retriever", "vectordb"] }],
};

const scene = (s: Omit<PresentationScene, "order" | "transition" | "durationMs"> & Partial<PresentationScene>, i: number): PresentationScene => ({
  order: i,
  durationMs: 3000,
  transition: { type: "fade", durationMs: 700 },
  ...s,
});

/** A hand-written four-scene story for the RAG demo. */
export const RAG_SCENES: PresentationScene[] = [
  scene(
    {
      id: "s1",
      title: "A question comes in",
      description: "The user asks something the model was never trained on.",
      visibleNodeIds: ["user", "app"],
      visibleEdgeIds: ["e1"],
      highlightedNodeIds: ["user"],
      highlightedEdgeIds: ["e1"],
    },
    0,
  ),
  scene(
    {
      id: "s2",
      title: "Find what’s relevant",
      description: "The query is embedded and matched against your documents.",
      visibleNodeIds: ["user", "app", "embedder", "retriever", "vectordb"],
      visibleEdgeIds: ["e1", "e2", "e3", "e4"],
      highlightedNodeIds: ["retriever", "vectordb"],
      highlightedEdgeIds: ["e4"],
    },
    1,
  ),
  scene(
    {
      id: "s3",
      title: "Add it to the prompt",
      description: "The best chunks are stitched into the prompt as context.",
      visibleNodeIds: ["user", "app", "embedder", "retriever", "vectordb", "augment", "llm"],
      visibleEdgeIds: ["e1", "e2", "e3", "e4", "e5", "e6"],
      highlightedNodeIds: ["augment"],
      highlightedEdgeIds: ["e5", "e6"],
    },
    2,
  ),
  scene(
    {
      id: "s4",
      title: "A grounded answer",
      description: "The LLM answers from your data, not from memory.",
      visibleNodeIds: RAG_DEMO.nodes.map((n) => n.id),
      visibleEdgeIds: RAG_DEMO.edges.map((e) => e.id),
      highlightedNodeIds: ["llm", "response"],
      highlightedEdgeIds: ["e7", "e8"],
      cameraByFormat: { landscape: { mode: "all" }, portrait: { mode: "all" } },
      transition: { type: "zoom", durationMs: 900 },
    },
    3,
  ),
];

export const DEMO_PROMPT = "Explain how a RAG pipeline answers a question";

/** Before/after diagrams for the "ask for changes" demo. */
export const EDIT_DEMO: DiagramDSL = {
  id: "demo-edit",
  title: "Request lifecycle",
  type: "architecture",
  layout: "left-to-right",
  version: 2,
  nodes: [
    { id: "browser", type: "actor", label: "Browser" },
    { id: "gateway", type: "gateway", label: "API gateway" },
    { id: "service", type: "service", label: "Orders service" },
    { id: "redis", type: "cache", label: "Redis" },
    { id: "db", type: "database", label: "PostgreSQL" },
  ],
  edges: [
    { id: "a", source: "browser", target: "gateway", label: "HTTPS" },
    { id: "b", source: "gateway", target: "service", label: "Route" },
    { id: "old", source: "service", target: "db", label: "SQL" },
    { id: "c", source: "service", target: "redis", label: "Cache lookup" },
    { id: "d", source: "redis", target: "db", label: "On miss" },
  ],
  groups: [],
};
