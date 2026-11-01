import http from "node:http";

/**
 * A tiny stand-in for a local Ollama server so the end-to-end journey can run
 * without downloading a model. It answers /api/version, /api/tags and
 * /api/chat with deterministic structured output, and sends CORS headers like
 * a real Ollama configured with OLLAMA_ORIGINS.
 */
const RAG = {
  title: "RAG Architecture",
  description: "How retrieval-augmented generation grounds answers in your documents.",
  type: "architecture",
  layout: "left-to-right",
  nodes: [
    { id: "user", type: "actor", label: "User" },
    { id: "app", type: "service", label: "Application" },
    { id: "embedder", type: "component", label: "Embedding Model", groupId: "retrieval" },
    { id: "vectordb", type: "database", label: "Vector Database", groupId: "retrieval" },
    { id: "retriever", type: "process", label: "Retriever", groupId: "retrieval" },
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
  groups: [{ id: "retrieval", label: "Retrieval", nodeIds: ["embedder", "vectordb", "retriever"] }],
};

const PATCH = {
  kind: "patch",
  summary: "Added a reranker between the retriever and context augmentation",
  operations: [
    { op: "add_node", node: { id: "reranker", type: "process", label: "Reranker" } },
    { op: "remove_edge", id: "e5" },
    { op: "add_edge", edge: { source: "retriever", target: "reranker", label: "Candidates" } },
    { op: "add_edge", edge: { source: "reranker", target: "augment", label: "Top-k chunks" } },
  ],
};

function scenesFor(nodeIds: string[], edgeIds: string[]) {
  const half = Math.ceil(nodeIds.length / 2);
  return {
    scenes: [
      { title: "The question", description: "A user asks the application a question.", visibleNodeIds: nodeIds.slice(0, 2), visibleEdgeIds: edgeIds.slice(0, 1), highlightedNodeIds: nodeIds.slice(0, 1), transition: "fade", durationMs: 4000 },
      { title: "Retrieval", description: "Relevant chunks are found in the vector database.", visibleNodeIds: nodeIds.slice(0, half), visibleEdgeIds: edgeIds, transition: "fade", durationMs: 5000 },
      { title: "Complete workflow", description: "The full request-response flow.", visibleNodeIds: nodeIds, visibleEdgeIds: edgeIds, transition: "zoom", durationMs: 6000 },
    ],
  };
}

export function startFakeOllama(port = 11555): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    const send = (data: unknown) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (req.url === "/api/version") return send({ version: "0.0.0-fake" });
    if (req.url === "/api/tags") return send({ models: [{ name: "fake-model:latest", details: { parameter_size: "1B" } }] });
    if (req.url === "/api/chat") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const { messages } = JSON.parse(body) as { messages: { role: string; content: string }[] };
        const system = messages[0]?.content ?? "";
        const user = messages[1]?.content ?? "";
        let out: unknown = RAG;
        if (system.includes("diagram editor")) out = PATCH;
        if (system.includes("presentation director")) {
          const nodes = (user.match(/Valid node ids: (.*)/)?.[1] ?? "").split(", ").filter(Boolean);
          const edges = (user.match(/Valid edge ids: (.*)/)?.[1] ?? "").split(", ").filter(Boolean);
          out = scenesFor(nodes, edges);
        }
        send({ model: "fake-model:latest", message: { role: "assistant", content: JSON.stringify(out) }, prompt_eval_count: 100, eval_count: 50 });
      });
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
