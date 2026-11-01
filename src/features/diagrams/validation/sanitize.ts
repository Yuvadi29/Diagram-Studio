import {
  DIAGRAM_TYPES,
  DiagramDSLSchema,
  EDGE_TYPES,
  LIMITS,
  NODE_TYPES,
  type DiagramDSL,
  type DiagramEdge,
  type DiagramGroup,
  type DiagramNode,
  type DiagramType,
  type EdgeType,
  type LayoutDirection,
  type NodeType,
} from "../schema/dsl";

/**
 * Deterministic repair of loosely-structured diagram data (typically LLM output).
 *
 * The goal is to turn "almost valid" data into valid data without guessing at
 * meaning: we normalise IDs and enum values, drop dangling references and
 * report every change as a warning. Anything we cannot fix is left for the
 * strict Zod schema to reject.
 */

export interface SanitizeResult {
  diagram: DiagramDSL;
  warnings: string[];
}

const NODE_TYPE_SYNONYMS: Record<string, NodeType> = {
  user: "actor",
  person: "actor",
  client: "actor",
  browser: "actor",
  human: "actor",
  customer: "actor",
  db: "database",
  datastore: "database",
  "data-store": "database",
  storage: "database",
  table: "database",
  "vector-db": "database",
  "vector-database": "database",
  topic: "queue",
  stream: "queue",
  broker: "queue",
  "message-queue": "queue",
  bus: "queue",
  redis: "cache",
  memcached: "cache",
  "api-gateway": "gateway",
  "load-balancer": "gateway",
  lb: "gateway",
  proxy: "gateway",
  router: "gateway",
  api: "service",
  server: "service",
  backend: "service",
  microservice: "service",
  function: "service",
  lambda: "service",
  worker: "service",
  step: "process",
  task: "process",
  action: "process",
  start: "process",
  end: "process",
  activity: "process",
  condition: "decision",
  choice: "decision",
  branch: "decision",
  gate: "decision",
  external: "external-system",
  "third-party": "external-system",
  thirdparty: "external-system",
  saas: "external-system",
  note: "annotation",
  comment: "annotation",
  label: "annotation",
  module: "component",
  model: "component",
  llm: "component",
  agent: "component",
  tool: "component",
  ui: "component",
  frontend: "component",
  app: "component",
  application: "component",
};

const DIAGRAM_TYPE_SYNONYMS: Record<string, DiagramType> = {
  flow: "flowchart",
  "flow-chart": "flowchart",
  "system-architecture": "architecture",
  system: "architecture",
  microservices: "architecture",
  "sequence-diagram": "sequence",
  dataflow: "data-flow",
  "data-flow-diagram": "data-flow",
  dfd: "data-flow",
  workflow: "process",
  "process-workflow": "process",
  decision: "decision-tree",
  tree: "decision-tree",
  "ai-agent": "agent-workflow",
  agent: "agent-workflow",
  "agent-workflow-diagram": "agent-workflow",
  er: "database",
  erd: "database",
  "entity-relationship": "database",
  "database-relationship": "database",
  infra: "network",
  infrastructure: "network",
  "network-architecture": "network",
  etl: "pipeline",
  "data-pipeline": "pipeline",
};

const LAYOUT_SYNONYMS: Record<string, LayoutDirection> = {
  lr: "left-to-right",
  horizontal: "left-to-right",
  "left-right": "left-to-right",
  ltr: "left-to-right",
  tb: "top-to-bottom",
  td: "top-to-bottom",
  vertical: "top-to-bottom",
  "top-down": "top-to-bottom",
  "top-bottom": "top-to-bottom",
  free: "freeform",
  "free-form": "freeform",
};

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

function nonEmpty(v: unknown): string | undefined {
  const s = asString(v)?.trim();
  return s ? s : undefined;
}

function keyify(v: string): string {
  return v.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

/** Turn arbitrary text into a safe, readable ID. */
export function slugifyId(input: string, fallback = "item"): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_\-.:]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+$/, "")
    .slice(0, LIMITS.maxId - 6);
  return s || fallback;
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  let i = 2;
  while (used.has(id)) id = `${base}-${i++}`;
  used.add(id);
  return id;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export function normalizeNodeType(raw: unknown): NodeType | undefined {
  const s = nonEmpty(raw);
  if (!s) return undefined;
  const k = keyify(s);
  if ((NODE_TYPES as readonly string[]).includes(k)) return k as NodeType;
  return NODE_TYPE_SYNONYMS[k];
}

export function normalizeDiagramType(raw: unknown): DiagramType | undefined {
  const s = nonEmpty(raw);
  if (!s) return undefined;
  const k = keyify(s);
  if ((DIAGRAM_TYPES as readonly string[]).includes(k)) return k as DiagramType;
  return DIAGRAM_TYPE_SYNONYMS[k];
}

export function normalizeLayout(raw: unknown): LayoutDirection | undefined {
  const s = nonEmpty(raw);
  if (!s) return undefined;
  const k = keyify(s);
  if (k === "left-to-right" || k === "top-to-bottom" || k === "freeform") return k;
  return LAYOUT_SYNONYMS[k];
}

function normalizeEdgeType(raw: unknown): EdgeType | undefined {
  const s = nonEmpty(raw);
  if (!s) return undefined;
  const k = keyify(s);
  if ((EDGE_TYPES as readonly string[]).includes(k)) return k as EdgeType;
  if (k === "dotted" || k === "async") return "dashed";
  if (k === "two-way" || k === "both" || k === "bi-directional") return "bidirectional";
  if (k === "solid" || k === "sync") return "default";
  return undefined;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export interface SanitizeOptions {
  /** ID to use when the input does not carry one. */
  fallbackId?: string;
  /** Diagram type to use when the input does not carry a valid one. */
  fallbackType?: DiagramType;
  fallbackTitle?: string;
}

export function sanitizeDiagram(input: unknown, opts: SanitizeOptions = {}): SanitizeResult {
  const warnings: string[] = [];
  const raw = asRecord(input);

  // ── Nodes ────────────────────────────────────────────────────────────────
  const usedNodeIds = new Set<string>();
  /** Maps any reference the model might use (raw id, label) to the final node id. */
  const nodeRef = new Map<string, string>();
  const nodes: DiagramNode[] = [];
  const rawNodes = asArray(raw.nodes);

  for (const [i, item] of rawNodes.entries()) {
    const n = asRecord(item);
    const label = nonEmpty(n.label) ?? nonEmpty(n.name) ?? nonEmpty(n.title) ?? nonEmpty(n.id);
    if (!label) {
      warnings.push(`Dropped node #${i + 1} because it has no label.`);
      continue;
    }
    if (nodes.length >= LIMITS.maxNodes) {
      warnings.push(`Diagram exceeded ${LIMITS.maxNodes} nodes; extra nodes were dropped.`);
      break;
    }
    const rawId = nonEmpty(n.id);
    const baseId = slugifyId(rawId ?? label, `node-${i + 1}`);
    const id = uniqueId(baseId, usedNodeIds);
    if (rawId && rawId !== id) {
      if (usedNodeIds.has(rawId) && nodeRef.has(rawId)) warnings.push(`Renamed duplicate node id "${rawId}" to "${id}".`);
    }
    if (rawId && !nodeRef.has(rawId)) nodeRef.set(rawId, id);
    if (!nodeRef.has(id)) nodeRef.set(id, id);
    const labelKey = label.toLowerCase();
    if (!nodeRef.has(`label:${labelKey}`)) nodeRef.set(`label:${labelKey}`, id);

    let type = normalizeNodeType(n.type);
    if (!type) {
      if (n.type !== undefined) warnings.push(`Unknown node type "${String(n.type)}" for "${label}"; using "component".`);
      type = "component";
    }

    const node: DiagramNode = { id, type, label: truncate(label, LIMITS.maxLabel) };
    const description = nonEmpty(n.description);
    if (description) node.description = truncate(description, LIMITS.maxDescription);
    const groupId = nonEmpty(n.groupId) ?? nonEmpty(n.group);
    if (groupId) node.groupId = groupId; // resolved after groups are parsed
    const style = asRecord(n.style);
    if (typeof style.highlight === "boolean") node.style = { highlight: style.highlight };
    const metadata = asRecord(n.metadata);
    if (Object.keys(metadata).length) node.metadata = metadata;
    nodes.push(node);
  }

  const resolveNode = (ref: unknown): string | undefined => {
    const s = nonEmpty(ref);
    if (!s) return undefined;
    return nodeRef.get(s) ?? nodeRef.get(slugifyId(s)) ?? nodeRef.get(`label:${s.toLowerCase()}`);
  };

  // ── Groups ───────────────────────────────────────────────────────────────
  const usedGroupIds = new Set<string>();
  const groupRef = new Map<string, string>();
  const groups: DiagramGroup[] = [];
  const nodeGroup = new Map<string, string>();

  for (const [i, item] of asArray(raw.groups).entries()) {
    const g = asRecord(item);
    const label = nonEmpty(g.label) ?? nonEmpty(g.name) ?? nonEmpty(g.title) ?? nonEmpty(g.id);
    if (!label) {
      warnings.push(`Dropped group #${i + 1} because it has no label.`);
      continue;
    }
    if (groups.length >= LIMITS.maxGroups) break;
    const rawId = nonEmpty(g.id);
    const id = uniqueId(slugifyId(rawId ?? label, `group-${i + 1}`), usedGroupIds);
    if (rawId) groupRef.set(rawId, id);
    groupRef.set(id, id);
    groupRef.set(`label:${label.toLowerCase()}`, id);
    const memberIds: string[] = [];
    for (const ref of asArray(g.nodeIds ?? g.nodes)) {
      const nid = resolveNode(ref);
      if (!nid) {
        warnings.push(`Group "${label}" referenced a missing node "${String(ref)}"; removed the reference.`);
        continue;
      }
      if (nodeGroup.has(nid) && nodeGroup.get(nid) !== id) {
        warnings.push(`Node "${nid}" was in multiple groups; kept it in the first one.`);
        continue;
      }
      if (!memberIds.includes(nid)) memberIds.push(nid);
      nodeGroup.set(nid, id);
    }
    groups.push({ id, label: truncate(label, LIMITS.maxLabel), nodeIds: memberIds });
  }

  // Reconcile node.groupId <-> group.nodeIds in both directions.
  for (const node of nodes) {
    if (node.groupId) {
      const gid = groupRef.get(node.groupId) ?? groupRef.get(slugifyId(node.groupId)) ?? groupRef.get(`label:${node.groupId.toLowerCase()}`);
      const assigned = nodeGroup.get(node.id);
      if (!gid) {
        warnings.push(`Node "${node.label}" referenced a missing group "${node.groupId}"; removed the reference.`);
        delete node.groupId;
      } else if (assigned && assigned !== gid) {
        node.groupId = assigned;
      } else {
        node.groupId = gid;
        if (!assigned) {
          nodeGroup.set(node.id, gid);
          groups.find((g) => g.id === gid)?.nodeIds.push(node.id);
        }
      }
    } else if (nodeGroup.has(node.id)) {
      node.groupId = nodeGroup.get(node.id);
    }
  }
  const nonEmptyGroups = groups.filter((g) => {
    if (g.nodeIds.length === 0) {
      warnings.push(`Removed empty group "${g.label}".`);
      return false;
    }
    return true;
  });

  // ── Edges ────────────────────────────────────────────────────────────────
  const usedEdgeIds = new Set<string>();
  const edges: DiagramEdge[] = [];
  for (const [i, item] of asArray(raw.edges).entries()) {
    const e = asRecord(item);
    const source = resolveNode(e.source ?? e.from);
    const target = resolveNode(e.target ?? e.to);
    if (!source || !target) {
      warnings.push(
        `Dropped connection #${i + 1} (${String(e.source ?? e.from)} → ${String(e.target ?? e.to)}) because it references a component that does not exist.`,
      );
      continue;
    }
    if (edges.length >= LIMITS.maxEdges) {
      warnings.push(`Diagram exceeded ${LIMITS.maxEdges} connections; extra connections were dropped.`);
      break;
    }
    const rawId = nonEmpty(e.id);
    const id = uniqueId(slugifyId(rawId ?? `${source}-to-${target}`, `edge-${i + 1}`), usedEdgeIds);
    const edge: DiagramEdge = { id, source, target };
    const label = nonEmpty(e.label);
    if (label) edge.label = truncate(label, LIMITS.maxLabel);
    const type = normalizeEdgeType(e.type);
    if (type && type !== "default") edge.type = type;
    edges.push(edge);
  }

  // ── Diagram-level fields ────────────────────────────────────────────────
  let type = normalizeDiagramType(raw.type);
  if (!type) {
    if (raw.type !== undefined) warnings.push(`Unknown diagram type "${String(raw.type)}"; using "${opts.fallbackType ?? "flowchart"}".`);
    type = opts.fallbackType ?? "flowchart";
  }
  const layout = normalizeLayout(raw.layout) ?? (type === "sequence" ? "left-to-right" : "left-to-right");
  const version = typeof raw.version === "number" && Number.isInteger(raw.version) && raw.version > 0 ? raw.version : 1;

  const diagram: DiagramDSL = {
    id: nonEmpty(raw.id)?.slice(0, LIMITS.maxId) ?? opts.fallbackId ?? "diagram",
    title: truncate(nonEmpty(raw.title) ?? opts.fallbackTitle ?? "Untitled diagram", LIMITS.maxTitle),
    type,
    layout,
    nodes,
    edges,
    groups: nonEmptyGroups,
    version,
  };
  const description = nonEmpty(raw.description);
  if (description) diagram.description = truncate(description, LIMITS.maxDescription);

  return { diagram, warnings };
}

export type ValidationResult =
  | { success: true; diagram: DiagramDSL }
  | { success: false; errors: string[] };

/** Strict validation (no repair). */
export function validateDiagram(input: unknown): ValidationResult {
  const parsed = DiagramDSLSchema.safeParse(input);
  if (parsed.success) return { success: true, diagram: parsed.data };
  return {
    success: false,
    errors: parsed.error.issues.slice(0, 25).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

/** Sanitize, then validate strictly. */
export function repairAndValidate(input: unknown, opts: SanitizeOptions = {}):
  | { success: true; diagram: DiagramDSL; warnings: string[] }
  | { success: false; errors: string[]; warnings: string[] } {
  const { diagram, warnings } = sanitizeDiagram(input, opts);
  const result = validateDiagram(diagram);
  if (result.success) return { success: true, diagram: result.diagram, warnings };
  return { success: false, errors: result.errors, warnings };
}
