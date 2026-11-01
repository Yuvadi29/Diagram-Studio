import type { DiagramDSL, DiagramEdge, DiagramNode } from "@/features/diagrams/schema/dsl";
import type { PresentationScene } from "@/features/presentations";

/**
 * Landing-page story content. Each topic is a real diagram, a real AI edit
 * (before → after) and a hand-written four-scene presentation of the result.
 * Everything is rendered live by the product's own engine.
 */
export interface Topic {
  id: string;
  label: string;
  prompt: string;
  editPrompt: string;
  diff: { kind: "add" | "remove"; text: string }[];
  /** Diagram before the edit. */
  before: DiagramDSL;
  /** Diagram after the edit (what gets presented). */
  after: DiagramDSL;
  /** Union of both, so positions stay stable across the edit. */
  union: DiagramDSL;
  scenes: PresentationScene[];
  file: string;
}

type N = [id: string, type: DiagramNode["type"], label: string, groupId?: string];
type E = [id: string, source: string, target: string, label?: string, type?: DiagramEdge["type"]];

function dsl(id: string, title: string, type: DiagramDSL["type"], nodes: N[], edges: E[], groups: DiagramDSL["groups"] = []): DiagramDSL {
  return {
    id,
    title,
    type,
    layout: "left-to-right",
    version: 1,
    nodes: nodes.map(([nid, t, label, groupId]) => ({ id: nid, type: t, label, ...(groupId ? { groupId } : {}) })),
    edges: edges.map(([eid, source, target, label, et]) => ({ id: eid, source, target, ...(label ? { label } : {}), ...(et ? { type: et } : {}) })),
    groups,
  };
}

/** Scenes from node lists: visible nodes accumulate; highlighted edges touch highlighted nodes. */
function story(d: DiagramDSL, beats: { title: string; description: string; add: string[]; highlight: string[]; all?: boolean }[]): PresentationScene[] {
  const visible: string[] = [];
  return beats.map((b, i) => {
    visible.push(...b.add);
    const vis = new Set(b.all ? d.nodes.map((n) => n.id) : visible);
    const edges = d.edges.filter((e) => vis.has(e.source) && vis.has(e.target));
    const hi = new Set(b.highlight);
    return {
      id: `${d.id}-s${i + 1}`,
      title: b.title,
      description: b.description,
      order: i,
      visibleNodeIds: [...vis],
      visibleEdgeIds: edges.map((e) => e.id),
      highlightedNodeIds: b.highlight,
      highlightedEdgeIds: edges.filter((e) => hi.has(e.target) || (hi.has(e.source) && !b.all)).map((e) => e.id),
      cameraByFormat: b.all ? { landscape: { mode: "all" }, portrait: { mode: "all" } } : undefined,
      durationMs: 3000,
      transition: { type: b.all ? "zoom" : "fade", durationMs: 700 },
    };
  });
}

function makeTopic(t: Omit<Topic, "union" | "scenes"> & { beats: Parameters<typeof story>[1] }): Topic {
  const nodeIds = new Set(t.after.nodes.map((n) => n.id));
  const edgeIds = new Set(t.after.edges.map((e) => e.id));
  const union: DiagramDSL = {
    ...t.after,
    id: `${t.id}-union`,
    nodes: [...t.after.nodes, ...t.before.nodes.filter((n) => !nodeIds.has(n.id))],
    edges: [...t.after.edges, ...t.before.edges.filter((e) => !edgeIds.has(e.id))],
  };
  const { beats, ...rest } = t;
  return { ...rest, union, scenes: story(t.after, beats) };
}

// ── RAG ─────────────────────────────────────────────────────────────────────
const ragNodes: N[] = [
  ["user", "actor", "User"],
  ["app", "service", "Application"],
  ["embedder", "component", "Embedding model", "retrieval"],
  ["retriever", "process", "Retriever", "retrieval"],
  ["vectordb", "database", "Vector database", "retrieval"],
  ["augment", "process", "Context augmentation"],
  ["llm", "component", "LLM"],
  ["response", "process", "Response"],
];
const ragEdges: E[] = [
  ["r1", "user", "app", "Question"],
  ["r2", "app", "embedder", "Embed query"],
  ["r3", "embedder", "retriever", "Query vector"],
  ["r4", "retriever", "vectordb", "Similarity search"],
  ["r6", "augment", "llm", "Prompt + context"],
  ["r7", "llm", "response"],
  ["r8", "response", "user", undefined, "dashed"],
];
const ragGroups = [{ id: "retrieval", label: "Retrieval", nodeIds: ["embedder", "retriever", "vectordb"] }];

const rag = makeTopic({
  id: "rag",
  label: "RAG pipeline",
  prompt: "Explain how a RAG pipeline answers a question",
  editPrompt: "Add a reranker after the retriever",
  diff: [
    { kind: "add", text: "Reranker" },
    { kind: "remove", text: "Retriever → Context augmentation" },
    { kind: "add", text: "Retriever → Reranker" },
    { kind: "add", text: "Reranker → Context augmentation" },
  ],
  before: dsl("rag", "RAG pipeline", "architecture", ragNodes, [...ragEdges, ["r5", "retriever", "augment", "Top-k chunks"]], ragGroups),
  after: dsl(
    "rag",
    "RAG pipeline",
    "architecture",
    [...ragNodes, ["reranker", "process", "Reranker"]],
    [...ragEdges, ["r9", "retriever", "reranker", "Candidates"], ["r10", "reranker", "augment", "Best chunks"]],
    ragGroups,
  ),
  beats: [
    { title: "A question arrives", description: "The user asks something the model was never trained on.", add: ["user", "app"], highlight: ["user"] },
    { title: "Search your documents", description: "The question is embedded and matched against your own data.", add: ["embedder", "retriever", "vectordb"], highlight: ["retriever", "vectordb"] },
    { title: "Keep only the best", description: "A reranker picks the chunks that actually answer the question.", add: ["reranker", "augment"], highlight: ["reranker"] },
    { title: "Answer from your data", description: "The LLM responds with context, not guesses.", add: ["llm", "response"], highlight: ["llm", "response"], all: true },
  ],
  file: "rag-pipeline",
});

// ── JWT (sequence) ──────────────────────────────────────────────────────────
const jwtBefore = dsl(
  "jwt",
  "JWT authentication",
  "sequence",
  [
    ["client", "actor", "Client"],
    ["auth", "service", "Auth service"],
    ["api", "service", "Orders API"],
  ],
  [
    ["j1", "client", "auth", "POST /login"],
    ["j2", "auth", "client", "Signed JWT", "dashed"],
    ["j3", "client", "api", "GET /orders + Bearer token"],
    ["j5", "api", "api", "Verify signature"],
    ["j6", "api", "client", "200 OK", "dashed"],
  ],
);
const jwtAfter = dsl(
  "jwt",
  "JWT authentication",
  "sequence",
  [
    ["client", "actor", "Client"],
    ["auth", "service", "Auth service"],
    ["api", "service", "Orders API"],
    ["denylist", "cache", "Token denylist"],
  ],
  [
    ["j1", "client", "auth", "POST /login"],
    ["j2", "auth", "client", "Signed JWT", "dashed"],
    ["j3", "client", "api", "GET /orders + Bearer token"],
    ["j5", "api", "api", "Verify signature"],
    ["j4", "api", "denylist", "Revoked?"],
    ["j6", "api", "client", "200 OK", "dashed"],
  ],
);
const jwt = makeTopic({
  id: "jwt",
  label: "JWT auth",
  prompt: "Show how JWT authentication works between a client, an auth service and an API",
  editPrompt: "Check the token against a denylist",
  diff: [
    { kind: "add", text: "Token denylist" },
    { kind: "add", text: "Orders API → Token denylist: Revoked?" },
  ],
  before: jwtBefore,
  after: jwtAfter,
  beats: [
    { title: "Log in once", description: "The auth service checks credentials and signs a token.", add: ["client", "auth"], highlight: ["auth"] },
    { title: "Carry the token", description: "Every request to the API includes the token as a bearer header.", add: ["api"], highlight: ["api"] },
    { title: "Check it’s still valid", description: "A fast denylist lookup catches tokens revoked before they expire.", add: ["denylist"], highlight: ["denylist"] },
    { title: "Trust, verified", description: "Signed, unexpired, not revoked: the API answers.", add: [], highlight: ["client"], all: true },
  ],
  file: "jwt-authentication",
});

// ── Kafka ───────────────────────────────────────────────────────────────────
const kafkaNodes: N[] = [
  ["orders", "service", "Order service"],
  ["topic", "queue", "orders topic"],
  ["fulfil", "service", "Fulfilment consumers"],
  ["stream", "process", "Stream processor"],
  ["warehouse", "database", "Data warehouse"],
  ["email", "external-system", "Email provider"],
];
const kafkaEdges: E[] = [
  ["k1", "orders", "topic", "OrderPlaced"],
  ["k2", "topic", "fulfil", "Consume"],
  ["k3", "topic", "stream", "Stream"],
  ["k4", "stream", "warehouse", "Enriched events"],
  ["k5", "fulfil", "email", "Confirmation"],
];
const kafka = makeTopic({
  id: "kafka",
  label: "Kafka events",
  prompt: "Visualize a Kafka event processing workflow for online orders",
  editPrompt: "Send failed events to a dead-letter queue",
  diff: [
    { kind: "add", text: "Dead-letter queue" },
    { kind: "add", text: "Fulfilment consumers → Dead-letter queue" },
  ],
  before: { ...dsl("kafka", "Kafka order events", "pipeline", kafkaNodes, kafkaEdges) },
  after: dsl("kafka", "Kafka order events", "pipeline", [...kafkaNodes, ["dlq", "queue", "Dead-letter queue"]], [...kafkaEdges, ["k6", "fulfil", "dlq", "Failed events", "dashed"]]),
  beats: [
    { title: "An order is placed", description: "The order service publishes one event and moves on.", add: ["orders", "topic"], highlight: ["topic"] },
    { title: "Fan out", description: "Independent consumers read the same event at their own pace.", add: ["fulfil", "stream"], highlight: ["fulfil", "stream"] },
    { title: "Land everywhere it’s needed", description: "Analytics and customer email happen without slowing checkout.", add: ["warehouse", "email"], highlight: ["warehouse", "email"] },
    { title: "Failures don’t vanish", description: "Events that can’t be processed wait in a dead-letter queue.", add: ["dlq"], highlight: ["dlq"], all: true },
  ],
  file: "kafka-order-events",
});

// ── Microservices ───────────────────────────────────────────────────────────
const microNodes: N[] = [
  ["web", "actor", "Web app"],
  ["mobile", "actor", "Mobile app"],
  ["gateway", "gateway", "API gateway"],
  ["authsvc", "service", "Auth service", "services"],
  ["catalog", "service", "Catalog service", "services"],
  ["ordersvc", "service", "Order service", "services"],
  ["catalogdb", "database", "Catalog DB"],
  ["ordersdb", "database", "Orders DB"],
  ["bus", "queue", "Event bus"],
];
const microEdges: E[] = [
  ["m1", "web", "gateway", "HTTPS"],
  ["m2", "mobile", "gateway", "HTTPS"],
  ["m3", "gateway", "authsvc", "Verify"],
  ["m4", "gateway", "catalog", "Browse"],
  ["m5", "gateway", "ordersvc", "Checkout"],
  ["m7", "ordersvc", "ordersdb"],
  ["m8", "ordersvc", "bus", "OrderCreated", "dashed"],
];
const microGroups = [{ id: "services", label: "Services", nodeIds: ["authsvc", "catalog", "ordersvc"] }];
const micro = makeTopic({
  id: "micro",
  label: "Microservices",
  prompt: "Create a microservices architecture for an online store",
  editPrompt: "Put a cache in front of the catalog database",
  diff: [
    { kind: "add", text: "Redis cache" },
    { kind: "remove", text: "Catalog service → Catalog DB" },
    { kind: "add", text: "Catalog service → Redis cache" },
    { kind: "add", text: "Redis cache → Catalog DB" },
  ],
  before: dsl("micro", "Online store", "architecture", microNodes, [...microEdges, ["m6", "catalog", "catalogdb"]], microGroups),
  after: dsl(
    "micro",
    "Online store",
    "architecture",
    [...microNodes, ["cache", "cache", "Redis cache"]],
    [...microEdges, ["m9", "catalog", "cache", "Lookup"], ["m10", "cache", "catalogdb", "On miss"]],
    microGroups,
  ),
  beats: [
    { title: "One front door", description: "Every client talks to a single API gateway.", add: ["web", "mobile", "gateway"], highlight: ["gateway"] },
    { title: "Small services, one job each", description: "Auth, catalog and orders deploy and scale independently.", add: ["authsvc", "catalog", "ordersvc"], highlight: ["authsvc", "catalog", "ordersvc"] },
    { title: "Hot reads stay fast", description: "Catalog lookups hit the cache first; each service owns its data.", add: ["cache", "catalogdb", "ordersdb"], highlight: ["cache"] },
    { title: "Events tie it together", description: "Services react to each other through the bus, not direct calls.", add: ["bus"], highlight: ["bus"], all: true },
  ],
  file: "online-store-architecture",
});

export const TOPICS: Topic[] = [micro, rag, kafka, jwt];
export const DEFAULT_TOPIC = micro.id;

