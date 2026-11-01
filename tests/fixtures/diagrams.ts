import type { DiagramDSL } from "@/features/diagrams/schema/dsl";

export const httpDiagram: DiagramDSL = {
  id: "http",
  title: "HTTP Request Lifecycle",
  type: "architecture",
  layout: "left-to-right",
  version: 1,
  nodes: [
    { id: "browser", type: "actor", label: "Browser" },
    { id: "gateway", type: "gateway", label: "API Gateway" },
    { id: "service", type: "service", label: "Backend Service" },
    { id: "database", type: "database", label: "PostgreSQL" },
  ],
  edges: [
    { id: "edge-1", source: "browser", target: "gateway", label: "HTTP Request" },
    { id: "edge-2", source: "gateway", target: "service", label: "Forward Request" },
    { id: "edge-3", source: "service", target: "database", label: "SQL Query" },
  ],
  groups: [],
};

export const ragDiagram: DiagramDSL = {
  id: "rag",
  title: "RAG Architecture",
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

export const sequenceDiagram: DiagramDSL = {
  id: "jwt",
  title: "JWT Authentication",
  type: "sequence",
  layout: "left-to-right",
  version: 1,
  nodes: [
    { id: "client", type: "actor", label: "Client" },
    { id: "auth", type: "service", label: "Auth Service" },
    { id: "api", type: "service", label: "API" },
  ],
  edges: [
    { id: "m1", source: "client", target: "auth", label: "POST /login" },
    { id: "m2", source: "auth", target: "client", label: "JWT", type: "dashed" },
    { id: "m3", source: "client", target: "api", label: "GET /data + Bearer JWT" },
    { id: "m4", source: "api", target: "api", label: "Verify signature" },
    { id: "m5", source: "api", target: "client", label: "200 OK", type: "dashed" },
  ],
  groups: [],
};
