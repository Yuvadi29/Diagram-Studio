import {
  DIAGRAM_TYPE_LABELS,
  DIAGRAM_TYPES,
  NODE_TYPES,
  type DiagramContext,
  type DiagramDSL,
  type DiagramType,
} from "../../diagrams/schema/dsl";

const NODE_TYPE_GUIDE = `Node types:
- actor: a human or client that initiates something (user, browser, mobile app)
- service: a backend service, API, server, function or worker
- database: a persistent data store (SQL, NoSQL, vector database, object storage)
- queue: a message queue, topic, stream or event bus
- cache: an in-memory cache (Redis, Memcached, CDN cache)
- gateway: API gateway, load balancer, reverse proxy, router
- process: a step or activity in a process/pipeline
- decision: a yes/no or multi-way branch
- external-system: a third-party system outside your control
- component: a software component, model, module or UI piece
- annotation: a short free-text note (use sparingly)`;

const TYPE_GUIDANCE: Partial<Record<DiagramType, string>> = {
  sequence:
    "Sequence diagram: nodes are the participants, listed left-to-right in the order they first appear. Every edge is ONE message, and edges MUST be listed in chronological order. Use type \"dashed\" for responses/returns. A participant may send a message to itself (same source and target).",
  "decision-tree":
    "Decision tree: start from a single root. Use \"decision\" nodes for questions and label each outgoing edge with the answer (e.g. \"Yes\"/\"No\"). Leaves are outcomes (process nodes). Prefer layout top-to-bottom.",
  flowchart:
    "Flowchart: start with a process node named like \"Start\" and end with an \"End\" node when it helps. Use decision nodes for branches with labelled edges.",
  pipeline: "Pipeline: stages connected in order, left-to-right. Use groups for stage families when it helps.",
  "agent-workflow":
    "AI agent workflow: include the user/trigger, the agent (component), its tools (component or external-system), memory (database), the LLM (component) and the loop back from tool results to the agent.",
  database:
    "Database relationships: nodes are tables/collections (type database). Edges are relationships labelled with cardinality, e.g. \"1:N\". Put key columns in the node description.",
  network:
    "Network architecture: include clients, edge/CDN, load balancers (gateway), subnets/zones as groups, servers (service) and data stores.",
  "data-flow": "Data flow: show sources, transformations (process) and sinks; label every edge with the data that flows.",
  architecture:
    "System architecture: show clients, entry points (gateway), services, data stores, caches and queues. Use groups for logical boundaries (e.g. \"Backend\", \"Data layer\") when it adds clarity.",
};

export const DIAGRAM_SYSTEM_PROMPT = `You are FlowDeck's diagram architect. You turn a description of a technical concept into a clear, accurate, structured diagram specification.

You output ONLY a JSON object matching the provided schema. You never output coordinates, styling, markdown or commentary.

Rules:
- Pick the most appropriate diagram type from: ${DIAGRAM_TYPES.join(", ")}.
- Use between 3 and 16 nodes for most diagrams (never more than 40). Prefer clarity over completeness.
- Node ids are short, unique, kebab-case (e.g. "api-gateway"). Edge ids are unique (e.g. "e1", "e2").
- Every edge source and target MUST be an existing node id.
- Labels are short (1-4 words). Put explanations in "description" (one sentence).
- Edge labels are short verb phrases describing what flows ("HTTP request", "publishes event").
- Group ids must be unique; a node belongs to at most one group; groupId on a node must match a group id, and the group's nodeIds must list it.
- Use layout "left-to-right" for flows and architectures, "top-to-bottom" for hierarchies and decision trees.
- Be technically accurate. Do not invent unrelated components.

${NODE_TYPE_GUIDE}

Example: for "a browser request reaches a backend API through an API gateway and reads from PostgreSQL":
{"title":"HTTP Request Lifecycle","description":"How a browser request flows through an API gateway to a backend service and PostgreSQL.","type":"architecture","layout":"left-to-right","nodes":[{"id":"browser","type":"actor","label":"Browser"},{"id":"gateway","type":"gateway","label":"API Gateway"},{"id":"service","type":"service","label":"Backend Service"},{"id":"database","type":"database","label":"PostgreSQL"}],"edges":[{"id":"e1","source":"browser","target":"gateway","label":"HTTP request"},{"id":"e2","source":"gateway","target":"service","label":"Forward request"},{"id":"e3","source":"service","target":"database","label":"SQL query"}],"groups":[]}`;

export function buildGeneratePrompt(prompt: string, ctx: DiagramContext = {}): string {
  const lines: string[] = [];
  if (ctx.diagramType && ctx.diagramType !== "auto") {
    lines.push(`Diagram type: ${ctx.diagramType} (${DIAGRAM_TYPE_LABELS[ctx.diagramType]}).`);
    const g = TYPE_GUIDANCE[ctx.diagramType];
    if (g) lines.push(g);
  } else {
    lines.push("Choose the diagram type that best explains the request.");
    lines.push("Type-specific guidance:");
    for (const [t, g] of Object.entries(TYPE_GUIDANCE)) lines.push(`- ${t}: ${g}`);
  }
  if (ctx.layout) lines.push(`Preferred layout: ${ctx.layout}.`);
  if (ctx.history?.length) {
    lines.push("Conversation so far:");
    for (const h of ctx.history.slice(-6)) lines.push(`${h.role === "user" ? "User" : "Assistant"}: ${h.content}`);
  }
  lines.push("", "Request:", prompt.trim());
  return lines.join("\n");
}

export const REFINE_SYSTEM_PROMPT = `You are FlowDeck's diagram editor. You receive the current diagram as JSON and a user instruction. You respond with a minimal set of structured operations that implement the instruction, as a JSON object matching the provided schema.

Response kinds:
- "patch": apply changes. Provide "summary" and "operations".
- "clarify": the instruction is ambiguous AND acting on it could destroy or wrongly change the user's work (e.g. "remove the service" when there are several services). Ask ONE short question in "question". Do not guess destructively.
- "explain": the user asks a question or asks you to explain something (e.g. "explain the selected component"). Answer in "answer" (2-5 sentences, plain text). No operations.

Operations (field "op"):
- add_node: { node: { id, type, label, description?, groupId? } }
- update_node: { id, changes: { label?, type?, description?, groupId?, highlight? } }  (highlight true/false emphasises a node)
- remove_node: { id }  (its connections are removed automatically)
- add_edge: { edge: { source, target, label?, type? } }
- update_edge: { id, changes: { label?, type?, source?, target? } }
- remove_edge: { id }
- add_group: { group: { label, nodeIds } }
- update_group: { id, changes: { label?, nodeIds? } }
- remove_group: { id }
- set_layout: { layout: "left-to-right" | "top-to-bottom" }
- set_title: { title }
- set_type: { diagramType }

Critical rules:
- Change ONLY what the instruction requires. Never recreate existing nodes; reference them by their existing id.
- Keep all existing ids unchanged.
- "Add X between A and B": add node X, remove the edge A→B (by its id), add edges A→X and X→B.
- "Simplify": merge or remove only clearly redundant or minor nodes; keep the main flow intact.
- "Highlight X": update_node with changes.highlight = true (and un-highlight others only if asked).
- "Make it vertical": set_layout top-to-bottom.
- New node ids are short kebab-case and must not clash with existing ids.
- Every edge must reference existing node ids (or ids of nodes you add in the same response).

${NODE_TYPE_GUIDE}`;

export function compactDiagram(d: DiagramDSL) {
  return {
    title: d.title,
    type: d.type,
    layout: d.layout,
    nodes: d.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      ...(n.description ? { description: n.description } : {}),
      ...(n.groupId ? { groupId: n.groupId } : {}),
      ...(n.style?.highlight ? { highlight: true } : {}),
    })),
    edges: d.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, ...(e.label ? { label: e.label } : {}), ...(e.type ? { type: e.type } : {}) })),
    groups: (d.groups ?? []).map((g) => ({ id: g.id, label: g.label, nodeIds: g.nodeIds })),
  };
}

export function buildRefinePrompt(
  diagram: DiagramDSL,
  instruction: string,
  ctx: { selectedNodeIds?: string[]; history?: { role: "user" | "assistant"; content: string }[] } = {},
): string {
  const lines = ["Current diagram:", JSON.stringify(compactDiagram(diagram))];
  if (ctx.selectedNodeIds?.length) {
    const sel = diagram.nodes.filter((n) => ctx.selectedNodeIds!.includes(n.id)).map((n) => `${n.id} (${n.label})`);
    if (sel.length) lines.push(`Currently selected components: ${sel.join(", ")}. "This", "it" or "the selected component" refers to them.`);
  }
  if (ctx.history?.length) {
    lines.push("Recent conversation:");
    for (const h of ctx.history.slice(-6)) lines.push(`${h.role === "user" ? "User" : "Assistant"}: ${h.content}`);
  }
  lines.push("", "Instruction:", instruction.trim());
  return lines.join("\n");
}

export const SCENES_SYSTEM_PROMPT = `You are FlowDeck's presentation director. Given a diagram, you design a progressive, scene-by-scene explanation that a technical educator could present or record.

Output ONLY a JSON object matching the provided schema.

Rules:
- 3 to 8 scenes. Tell a story: start with the problem or entry point, build up the flow step by step, and end with a "complete" scene that shows everything.
- Use ONLY node ids and edge ids that exist in the diagram. Never invent ids.
- Visibility is usually cumulative: each scene shows what was already shown plus the new part.
- Only list an edge as visible when both of its endpoint nodes are visible.
- Highlight what is new or important in each scene (highlightedNodeIds / highlightedEdgeIds).
- Use dimmedNodeIds sparingly to de-emphasise context.
- Each description is 1-2 sentences of narration in plain language.
- durationMs between 3000 and 12000 depending on how much there is to explain.
- transition: "fade" by default, "zoom" for the final overview scene, "none" rarely.`;

export function buildScenesPrompt(diagram: DiagramDSL, guidance?: string): string {
  const lines = ["Diagram:", JSON.stringify(compactDiagram(diagram))];
  if (guidance?.trim()) lines.push("", "Presenter guidance:", guidance.trim());
  lines.push("", `Valid node ids: ${diagram.nodes.map((n) => n.id).join(", ")}`, `Valid edge ids: ${diagram.edges.map((e) => e.id).join(", ")}`);
  return lines.join("\n");
}

export function buildRepairPrompt(originalPrompt: string, badOutput: string, errors: string[]): string {
  return [
    originalPrompt,
    "",
    "Your previous response was invalid:",
    ...errors.slice(0, 15).map((e) => `- ${e}`),
    "",
    "Previous response (truncated):",
    badOutput.slice(0, 6000),
    "",
    "Return a corrected JSON object only, fixing every problem listed above.",
  ].join("\n");
}

export { NODE_TYPES };
