import { z } from "zod";

/**
 * DiagramDSL — the logical source of truth for a diagram's structure.
 *
 * The Excalidraw scene is the editable canvas representation; the two are kept
 * in sync through the adapter in `features/excalidraw/adapter`.
 * The LLM only ever produces this structure. It never produces coordinates.
 */

export const DIAGRAM_TYPES = [
  "flowchart",
  "architecture",
  "sequence",
  "data-flow",
  "process",
  "decision-tree",
  "pipeline",
  "agent-workflow",
  "network",
  "database",
] as const;

export const NODE_TYPES = [
  "actor",
  "service",
  "database",
  "queue",
  "cache",
  "gateway",
  "process",
  "decision",
  "external-system",
  "component",
  "annotation",
] as const;

export const LAYOUT_DIRECTIONS = ["left-to-right", "top-to-bottom", "freeform"] as const;
export const EDGE_TYPES = ["default", "dashed", "bidirectional"] as const;

export const LIMITS = {
  maxNodes: 120,
  maxEdges: 240,
  maxGroups: 30,
  maxLabel: 80,
  maxDescription: 600,
  maxTitle: 120,
  maxId: 64,
} as const;

export type DiagramType = (typeof DIAGRAM_TYPES)[number];
export type NodeType = (typeof NODE_TYPES)[number];
export type LayoutDirection = (typeof LAYOUT_DIRECTIONS)[number];
export type EdgeType = (typeof EDGE_TYPES)[number];

const idSchema = z
  .string()
  .min(1, "ID is required")
  .max(LIMITS.maxId)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_\-.:]*$/, "IDs may only contain letters, numbers, '-', '_', '.', ':'");

export const NodeStyleSchema = z
  .object({
    highlight: z.boolean().optional(),
  })
  .strict();

export const DiagramNodeSchema = z.object({
  id: idSchema,
  type: z.enum(NODE_TYPES),
  label: z.string().trim().min(1, "Node label is required").max(LIMITS.maxLabel),
  description: z.string().max(LIMITS.maxDescription).optional(),
  groupId: idSchema.optional(),
  style: NodeStyleSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const DiagramEdgeSchema = z.object({
  id: idSchema,
  source: idSchema,
  target: idSchema,
  label: z.string().max(LIMITS.maxLabel).optional(),
  type: z.enum(EDGE_TYPES).optional(),
});

export const DiagramGroupSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1, "Group label is required").max(LIMITS.maxLabel),
  nodeIds: z.array(idSchema),
});

const DiagramDSLBaseSchema = z.object({
  id: z.string().min(1).max(LIMITS.maxId),
  title: z.string().trim().min(1).max(LIMITS.maxTitle),
  description: z.string().max(LIMITS.maxDescription).optional(),
  type: z.enum(DIAGRAM_TYPES),
  layout: z.enum(LAYOUT_DIRECTIONS),
  nodes: z.array(DiagramNodeSchema).max(LIMITS.maxNodes, `A diagram may have at most ${LIMITS.maxNodes} nodes`),
  edges: z.array(DiagramEdgeSchema).max(LIMITS.maxEdges, `A diagram may have at most ${LIMITS.maxEdges} edges`),
  groups: z.array(DiagramGroupSchema).max(LIMITS.maxGroups).optional(),
  version: z.number().int().min(1),
});

/** Strict schema: structural validation plus referential integrity. */
export const DiagramDSLSchema = DiagramDSLBaseSchema.superRefine((d, ctx) => {
  const nodeIds = new Set<string>();
  d.nodes.forEach((n, i) => {
    if (nodeIds.has(n.id)) {
      ctx.addIssue({ code: "custom", path: ["nodes", i, "id"], message: `Duplicate node id "${n.id}"` });
    }
    nodeIds.add(n.id);
  });

  const edgeIds = new Set<string>();
  d.edges.forEach((e, i) => {
    if (edgeIds.has(e.id)) {
      ctx.addIssue({ code: "custom", path: ["edges", i, "id"], message: `Duplicate edge id "${e.id}"` });
    }
    edgeIds.add(e.id);
    if (!nodeIds.has(e.source)) {
      ctx.addIssue({ code: "custom", path: ["edges", i, "source"], message: `Edge "${e.id}" source "${e.source}" does not exist` });
    }
    if (!nodeIds.has(e.target)) {
      ctx.addIssue({ code: "custom", path: ["edges", i, "target"], message: `Edge "${e.id}" target "${e.target}" does not exist` });
    }
  });

  const groupIds = new Set<string>();
  (d.groups ?? []).forEach((g, i) => {
    if (groupIds.has(g.id)) {
      ctx.addIssue({ code: "custom", path: ["groups", i, "id"], message: `Duplicate group id "${g.id}"` });
    }
    groupIds.add(g.id);
    g.nodeIds.forEach((nid, j) => {
      if (!nodeIds.has(nid)) {
        ctx.addIssue({ code: "custom", path: ["groups", i, "nodeIds", j], message: `Group "${g.id}" references missing node "${nid}"` });
      }
    });
  });

  d.nodes.forEach((n, i) => {
    if (n.groupId && !groupIds.has(n.groupId)) {
      ctx.addIssue({ code: "custom", path: ["nodes", i, "groupId"], message: `Node "${n.id}" references missing group "${n.groupId}"` });
    }
  });
});

export type DiagramNode = z.infer<typeof DiagramNodeSchema>;
export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>;
export type DiagramGroup = z.infer<typeof DiagramGroupSchema>;
export type DiagramDSL = z.infer<typeof DiagramDSLSchema>;

export interface DiagramContext {
  /** Hint for the diagram type; "auto" lets the model decide. */
  diagramType?: DiagramType | "auto";
  /** Preferred layout direction. */
  layout?: LayoutDirection;
  /** Prior conversation turns (for clarifications). */
  history?: { role: "user" | "assistant"; content: string }[];
}

export const DIAGRAM_TYPE_LABELS: Record<DiagramType, string> = {
  flowchart: "Flowchart",
  architecture: "System architecture",
  sequence: "Sequence diagram",
  "data-flow": "Data flow",
  process: "Process workflow",
  "decision-tree": "Decision tree",
  pipeline: "Pipeline",
  "agent-workflow": "AI agent workflow",
  network: "Network architecture",
  database: "Database relationships",
};

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  actor: "Actor",
  service: "Service",
  database: "Database",
  queue: "Queue",
  cache: "Cache",
  gateway: "Gateway",
  process: "Process",
  decision: "Decision",
  "external-system": "External system",
  component: "Component",
  annotation: "Annotation",
};

export function createEmptyDiagram(id: string, title = "Untitled diagram"): DiagramDSL {
  return {
    id,
    title,
    type: "architecture",
    layout: "left-to-right",
    nodes: [],
    edges: [],
    groups: [],
    version: 1,
  };
}
