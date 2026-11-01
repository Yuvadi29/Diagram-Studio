import { z } from "zod";
import {
  DIAGRAM_TYPES,
  EDGE_TYPES,
  LAYOUT_DIRECTIONS,
  LIMITS,
  NODE_TYPES,
  type DiagramDSL,
  type DiagramEdge,
  type DiagramGroup,
  type DiagramNode,
} from "../schema/dsl";
import { normalizeDiagramType, normalizeLayout, normalizeNodeType, slugifyId } from "../validation/sanitize";
import { validateDiagram } from "../validation/sanitize";

/**
 * Structured diagram modifications.
 *
 * Instead of asking the model to regenerate the entire diagram, refinement
 * produces a small list of operations. Applying them is deterministic, so
 * every node/edge the instruction did not touch is preserved exactly
 * (including its ID, which the Excalidraw adapter uses to keep positions).
 */

export const PATCH_OPS = [
  "add_node",
  "update_node",
  "remove_node",
  "add_edge",
  "update_edge",
  "remove_edge",
  "add_group",
  "update_group",
  "remove_group",
  "set_layout",
  "set_title",
  "set_type",
] as const;

const optionalString = z.string().nullish().transform((v) => (v == null || v === "" ? undefined : v));

export const PatchOperationSchema = z.object({
  op: z.enum(PATCH_OPS),
  /** Target id for update_* / remove_* operations. */
  id: optionalString,
  node: z
    .object({
      id: optionalString,
      type: optionalString,
      label: optionalString,
      description: optionalString,
      groupId: optionalString,
    })
    .nullish(),
  edge: z
    .object({
      id: optionalString,
      source: optionalString,
      target: optionalString,
      label: optionalString,
      type: optionalString,
    })
    .nullish(),
  group: z
    .object({
      id: optionalString,
      label: optionalString,
      nodeIds: z.array(z.string()).nullish(),
    })
    .nullish(),
  changes: z
    .object({
      label: optionalString,
      type: optionalString,
      description: z.string().nullish(),
      groupId: z.string().nullish(),
      highlight: z.boolean().nullish(),
      source: optionalString,
      target: optionalString,
      nodeIds: z.array(z.string()).nullish(),
    })
    .nullish(),
  layout: optionalString,
  title: optionalString,
  diagramType: optionalString,
});

export type PatchOperation = z.infer<typeof PatchOperationSchema>;
/** What callers may pass (optional fields may be omitted or null). */
export type PatchOperationInput = z.input<typeof PatchOperationSchema>;

export const RefinementResponseSchema = z.object({
  kind: z.enum(["patch", "clarify", "explain"]),
  summary: optionalString,
  question: optionalString,
  answer: optionalString,
  operations: z.array(PatchOperationSchema).max(80).nullish(),
});

export type RefinementResponse = z.infer<typeof RefinementResponseSchema>;

export interface PatchResult {
  diagram: DiagramDSL;
  /** Human-readable problems with individual operations that were skipped. */
  skipped: string[];
  /** True if the layout direction changed (callers should re-run layout). */
  layoutChanged: boolean;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  let i = 2;
  while (used.has(id)) id = `${base}-${i++}`;
  return id;
}

/**
 * Apply operations to a copy of `diagram`. Invalid operations are skipped and
 * reported. The final result is strictly validated; if validation fails an
 * error is thrown and the original diagram is untouched.
 */
export function applyPatch(diagram: DiagramDSL, operations: PatchOperationInput[]): PatchResult {
  const d = clone(diagram);
  d.groups = d.groups ?? [];
  const skipped: string[] = [];
  let layoutChanged = false;

  const nodeIds = () => new Set(d.nodes.map((n) => n.id));
  const edgeIds = () => new Set(d.edges.map((e) => e.id));
  const groupIds = () => new Set((d.groups ?? []).map((g) => g.id));

  /** Resolve a node reference by id, slug, or (case-insensitive) label. */
  const findNode = (ref: string | undefined | null): DiagramNode | undefined => {
    if (!ref) return undefined;
    return (
      d.nodes.find((n) => n.id === ref) ??
      d.nodes.find((n) => n.id === slugifyId(ref)) ??
      d.nodes.find((n) => n.label.toLowerCase() === ref.toLowerCase())
    );
  };
  const findEdge = (ref: string | undefined | null): DiagramEdge | undefined =>
    ref ? d.edges.find((e) => e.id === ref) : undefined;

  const setNodeGroup = (node: DiagramNode, groupRef: string | null | undefined) => {
    for (const g of d.groups ?? []) g.nodeIds = g.nodeIds.filter((id) => id !== node.id);
    if (!groupRef) {
      delete node.groupId;
      return true;
    }
    const g = (d.groups ?? []).find((x) => x.id === groupRef || x.label.toLowerCase() === groupRef.toLowerCase());
    if (!g) return false;
    g.nodeIds.push(node.id);
    node.groupId = g.id;
    return true;
  };

  for (const [i, op] of operations.entries()) {
    const where = `Operation ${i + 1} (${op.op})`;
    switch (op.op) {
      case "add_node": {
        const spec = op.node;
        const label = spec?.label?.trim();
        if (!label) {
          skipped.push(`${where}: missing label.`);
          break;
        }
        if (d.nodes.length >= LIMITS.maxNodes) {
          skipped.push(`${where}: node limit reached.`);
          break;
        }
        const id = uniqueId(slugifyId(spec?.id ?? label, "node"), nodeIds());
        const node: DiagramNode = {
          id,
          type: normalizeNodeType(spec?.type) ?? "component",
          label: label.slice(0, LIMITS.maxLabel),
        };
        if (spec?.description) node.description = spec.description.slice(0, LIMITS.maxDescription);
        d.nodes.push(node);
        if (spec?.groupId && !setNodeGroup(node, spec.groupId)) {
          skipped.push(`${where}: group "${spec.groupId}" does not exist; node added without a group.`);
        }
        break;
      }
      case "update_node": {
        const node = findNode(op.id ?? op.node?.id);
        if (!node) {
          skipped.push(`${where}: node "${op.id ?? op.node?.id ?? "?"}" does not exist.`);
          break;
        }
        const c: NonNullable<PatchOperationInput["changes"]> = op.changes ?? {};
        const label = c.label ?? op.node?.label;
        if (label?.trim()) node.label = label.trim().slice(0, LIMITS.maxLabel);
        const type = normalizeNodeType(c.type ?? op.node?.type);
        if (type) node.type = type;
        if (c.description !== undefined && c.description !== null) {
          if (c.description === "") delete node.description;
          else node.description = c.description.slice(0, LIMITS.maxDescription);
        }
        if (c.groupId !== undefined) {
          if (!setNodeGroup(node, c.groupId)) skipped.push(`${where}: group "${c.groupId}" does not exist.`);
        }
        if (typeof c.highlight === "boolean") {
          node.style = { ...(node.style ?? {}), highlight: c.highlight };
          if (!c.highlight) delete node.style.highlight;
          if (node.style && Object.keys(node.style).length === 0) delete node.style;
        }
        break;
      }
      case "remove_node": {
        const node = findNode(op.id ?? op.node?.id);
        if (!node) {
          skipped.push(`${where}: node "${op.id ?? "?"}" does not exist.`);
          break;
        }
        d.nodes = d.nodes.filter((n) => n.id !== node.id);
        d.edges = d.edges.filter((e) => e.source !== node.id && e.target !== node.id);
        for (const g of d.groups ?? []) g.nodeIds = g.nodeIds.filter((id) => id !== node.id);
        break;
      }
      case "add_edge": {
        const spec = op.edge;
        const source = findNode(spec?.source);
        const target = findNode(spec?.target);
        if (!source || !target) {
          skipped.push(`${where}: connection references a component that does not exist (${spec?.source ?? "?"} → ${spec?.target ?? "?"}).`);
          break;
        }
        if (d.edges.length >= LIMITS.maxEdges) {
          skipped.push(`${where}: connection limit reached.`);
          break;
        }
        const duplicate = d.edges.find((e) => e.source === source.id && e.target === target.id && (e.label ?? "") === (spec?.label ?? ""));
        if (duplicate) {
          skipped.push(`${where}: connection already exists.`);
          break;
        }
        const id = uniqueId(slugifyId(spec?.id ?? `${source.id}-to-${target.id}`, "edge"), edgeIds());
        const edge: DiagramEdge = { id, source: source.id, target: target.id };
        if (spec?.label) edge.label = spec.label.slice(0, LIMITS.maxLabel);
        if (spec?.type && (EDGE_TYPES as readonly string[]).includes(spec.type) && spec.type !== "default") {
          edge.type = spec.type as DiagramEdge["type"];
        }
        d.edges.push(edge);
        break;
      }
      case "update_edge": {
        const edge = findEdge(op.id ?? op.edge?.id);
        if (!edge) {
          skipped.push(`${where}: connection "${op.id ?? "?"}" does not exist.`);
          break;
        }
        const c: NonNullable<PatchOperationInput["changes"]> = op.changes ?? {};
        if (c.label !== undefined) {
          if (c.label) edge.label = c.label.slice(0, LIMITS.maxLabel);
          else delete edge.label;
        } else if (op.edge?.label) {
          edge.label = op.edge.label.slice(0, LIMITS.maxLabel);
        }
        const t = c.type ?? op.edge?.type;
        if (t && (EDGE_TYPES as readonly string[]).includes(t)) {
          if (t === "default") delete edge.type;
          else edge.type = t as DiagramEdge["type"];
        }
        const src = c.source ? findNode(c.source) : undefined;
        const tgt = c.target ? findNode(c.target) : undefined;
        if (c.source && !src) skipped.push(`${where}: source "${c.source}" does not exist.`);
        if (c.target && !tgt) skipped.push(`${where}: target "${c.target}" does not exist.`);
        if (src) edge.source = src.id;
        if (tgt) edge.target = tgt.id;
        break;
      }
      case "remove_edge": {
        let edge = findEdge(op.id ?? op.edge?.id);
        if (!edge && op.edge?.source && op.edge?.target) {
          const s = findNode(op.edge.source);
          const t = findNode(op.edge.target);
          edge = d.edges.find((e) => e.source === s?.id && e.target === t?.id);
        }
        if (!edge) {
          skipped.push(`${where}: connection "${op.id ?? "?"}" does not exist.`);
          break;
        }
        const removeId = edge.id;
        d.edges = d.edges.filter((e) => e.id !== removeId);
        break;
      }
      case "add_group": {
        const label = op.group?.label?.trim();
        if (!label) {
          skipped.push(`${where}: missing group label.`);
          break;
        }
        const id = uniqueId(slugifyId(op.group?.id ?? label, "group"), groupIds());
        d.groups!.push({ id, label, nodeIds: [] });
        for (const ref of op.group?.nodeIds ?? []) {
          const node = findNode(ref);
          if (node) setNodeGroup(node, id);
          else skipped.push(`${where}: node "${ref}" does not exist.`);
        }
        break;
      }
      case "update_group": {
        const g = (d.groups ?? []).find((x) => x.id === (op.id ?? op.group?.id));
        if (!g) {
          skipped.push(`${where}: group "${op.id ?? "?"}" does not exist.`);
          break;
        }
        const label = op.changes?.label ?? op.group?.label;
        if (label?.trim()) g.label = label.trim();
        const members = op.changes?.nodeIds ?? op.group?.nodeIds;
        if (members) {
          for (const n of d.nodes) if (n.groupId === g.id) delete n.groupId;
          g.nodeIds = [];
          for (const ref of members) {
            const node = findNode(ref);
            if (node) setNodeGroup(node, g.id);
          }
        }
        break;
      }
      case "remove_group": {
        const gid = op.id ?? op.group?.id;
        const g: DiagramGroup | undefined = (d.groups ?? []).find((x) => x.id === gid);
        if (!g) {
          skipped.push(`${where}: group "${gid ?? "?"}" does not exist.`);
          break;
        }
        d.groups = (d.groups ?? []).filter((x) => x.id !== g.id);
        for (const n of d.nodes) if (n.groupId === g.id) delete n.groupId;
        break;
      }
      case "set_layout": {
        const layout = normalizeLayout(op.layout);
        if (!layout || !(LAYOUT_DIRECTIONS as readonly string[]).includes(layout)) {
          skipped.push(`${where}: unknown layout "${op.layout ?? "?"}".`);
          break;
        }
        if (layout !== d.layout) {
          d.layout = layout;
          layoutChanged = true;
        }
        break;
      }
      case "set_title": {
        if (op.title?.trim()) d.title = op.title.trim().slice(0, LIMITS.maxTitle);
        break;
      }
      case "set_type": {
        const t = normalizeDiagramType(op.diagramType);
        if (t && (DIAGRAM_TYPES as readonly string[]).includes(t)) d.type = t;
        else skipped.push(`${where}: unknown diagram type "${op.diagramType ?? "?"}".`);
        break;
      }
    }
  }

  d.groups = (d.groups ?? []).filter((g) => g.nodeIds.length > 0);
  for (const n of d.nodes) if (n.groupId && !d.groups.some((g) => g.id === n.groupId)) delete n.groupId;
  d.version = diagram.version + 1;

  const v = validateDiagram(d);
  if (!v.success) {
    throw new Error(`The modification produced an invalid diagram: ${v.errors.join("; ")}`);
  }
  return { diagram: v.diagram, skipped, layoutChanged };
}
