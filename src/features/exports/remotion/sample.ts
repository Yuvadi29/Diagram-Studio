import type { DiagramDSL } from "../../diagrams/schema/dsl";
import { DEFAULT_FORMATS, effectiveFormatConfig } from "../../presentations/formats";
import { buildPresentationModel } from "../../presentations/rendering/model";
import { autoGenerateScenes } from "../../presentations/scenes/auto";

/** Demo data for `bun run remotion:studio` (the RAG demo scenario). */
const rag: DiagramDSL = {
  id: "demo-rag",
  title: "RAG Architecture",
  description: "How retrieval-augmented generation grounds an LLM answer in your own documents.",
  type: "architecture",
  layout: "left-to-right",
  version: 1,
  nodes: [
    { id: "user", type: "actor", label: "User" },
    { id: "app", type: "service", label: "Application" },
    { id: "embedder", type: "component", label: "Embedding Model" },
    { id: "vectordb", type: "database", label: "Vector Database" },
    { id: "retriever", type: "process", label: "Retriever" },
    { id: "augment", type: "process", label: "Context Augmentation" },
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

export const sampleVideoProps = {
  model: buildPresentationModel(rag, "landscape", effectiveFormatConfig(rag, "landscape", DEFAULT_FORMATS.landscape)),
  scenes: autoGenerateScenes(rag),
};
