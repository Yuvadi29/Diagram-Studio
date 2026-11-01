import type { DiagramDSL, DiagramEdge, DiagramGroup, DiagramNode, NodeType } from "../../diagrams/schema/dsl";
import { createEmptyDiagram } from "../../diagrams/schema/dsl";
import { sanitizeDiagram } from "../../diagrams/validation/sanitize";
import type { Box } from "../../layout";
import { SHAPE_TYPES, type DsCustomData, type ExElement, type ExScene } from "./types";

function ds(el: ExElement): DsCustomData {
  return (el.customData ?? {}) as DsCustomData;
}

function inferType(el: ExElement): NodeType {
  if (el.type === "diamond") return "decision";
  if (el.type === "ellipse") return "actor";
  return "component";
}

function cleanLabel(text: string | undefined): string {
  return (text ?? "").replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Derive the logical diagram from the canvas.
 *
 * - Shapes created by the adapter keep their logical id; shapes the user drew
 *   (rectangle/ellipse/diamond with a text label) become new nodes whose id is
 *   the element id.
 * - Arrows bound to two nodes become edges (hand-drawn ones included).
 * - Information that does not live on the canvas (descriptions, metadata,
 *   group membership, diagram type) is carried over from `base`.
 */
export function fromExcalidrawScene(scene: ExScene, base?: DiagramDSL): DiagramDSL {
  const elements = scene.elements.filter((e) => !e.isDeleted);
  const baseDiagram = base ?? createEmptyDiagram("diagram");
  const baseNodes = new Map(baseDiagram.nodes.map((n) => [n.id, n]));
  const baseEdges = new Map(baseDiagram.edges.map((e) => [e.id, e]));

  const textByContainer = new Map<string, ExElement>();
  for (const el of elements) if (el.type === "text" && el.containerId) textByContainer.set(el.containerId, el);

  const nodes: DiagramNode[] = [];
  const shapeToNode = new Map<string, string>();
  const seen = new Set<string>();

  for (const el of elements) {
    const c = ds(el);
    const isManagedNode = c.dsKind === "node" && c.dsId;
    if (c.dsKind && c.dsKind !== "node") continue;
    let label: string;
    if (el.type === "text") {
      if (!isManagedNode) continue; // free user text is not part of the diagram
      label = cleanLabel(el.originalText ?? el.text);
    } else if (SHAPE_TYPES.has(el.type)) {
      const t = textByContainer.get(el.id);
      label = cleanLabel(t?.originalText ?? t?.text);
      if (!isManagedNode && !label) continue; // unlabeled doodles are not nodes
    } else {
      continue;
    }
    const id = (isManagedNode ? c.dsId : el.id) as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const prev = baseNodes.get(id);
    const node: DiagramNode = {
      ...(prev ?? {}),
      id,
      type: (c.dsType as NodeType | undefined) ?? prev?.type ?? (el.type === "text" ? "annotation" : inferType(el)),
      label: label || prev?.label || "Untitled",
    };
    if (c.dsHighlight) node.style = { ...(node.style ?? {}), highlight: true };
    else if (node.style?.highlight) {
      delete node.style.highlight;
      if (!Object.keys(node.style).length) delete node.style;
    }
    nodes.push(node);
    shapeToNode.set(el.id, id);
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: DiagramEdge[] = [];
  const seenEdges = new Set<string>();
  for (const el of elements) {
    if (el.type !== "arrow") continue;
    const c = ds(el);
    const source = (el.startBinding && shapeToNode.get(el.startBinding.elementId)) ?? (c.dsKind === "edge" ? c.dsSource : undefined);
    const target = (el.endBinding && shapeToNode.get(el.endBinding.elementId)) ?? (c.dsKind === "edge" ? c.dsTarget : undefined);
    if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) continue;
    const id = c.dsKind === "edge" && c.dsId ? c.dsId : el.id;
    if (seenEdges.has(id)) continue;
    seenEdges.add(id);
    const prev = baseEdges.get(id);
    const label = cleanLabel(textByContainer.get(el.id)?.text);
    const edge: DiagramEdge = { id, source, target };
    if (label) edge.label = label;
    const type = el.startArrowhead && el.endArrowhead ? "bidirectional" : el.strokeStyle === "dashed" || el.strokeStyle === "dotted" ? "dashed" : prev?.type;
    if (type && type !== "default") edge.type = type;
    edges.push(edge);
  }

  // Groups: keep base groups, refresh labels from the canvas, drop removed members.
  const groupLabels = new Map<string, string>();
  for (const el of elements) {
    const c = ds(el);
    if (c.dsKind === "group-label" && c.dsId) groupLabels.set(c.dsId, cleanLabel(el.text));
  }
  const groups: DiagramGroup[] = (baseDiagram.groups ?? [])
    .map((g) => ({ ...g, label: groupLabels.get(g.id) || g.label, nodeIds: g.nodeIds.filter((id) => nodeIds.has(id)) }))
    .filter((g) => g.nodeIds.length > 0);
  const groupIds = new Set(groups.map((g) => g.id));
  for (const n of nodes) {
    if (n.groupId && !groupIds.has(n.groupId)) delete n.groupId;
    const g = groups.find((x) => x.nodeIds.includes(n.id));
    if (g) n.groupId = g.id;
  }

  const { diagram } = sanitizeDiagram(
    { ...baseDiagram, nodes, edges, groups },
    { fallbackId: baseDiagram.id, fallbackType: baseDiagram.type, fallbackTitle: baseDiagram.title },
  );
  return diagram;
}

/** Bounding boxes of node shapes on the canvas, keyed by logical node id. */
export function getNodeBoxes(elements: readonly ExElement[]): Record<string, Box> {
  const out: Record<string, Box> = {};
  for (const el of elements) {
    if (el.isDeleted) continue;
    const c = ds(el);
    const id = c.dsKind === "node" && c.dsId ? c.dsId : SHAPE_TYPES.has(el.type) ? el.id : undefined;
    if (!id || out[id]) continue;
    out[id] = { x: el.x, y: el.y, width: el.width, height: el.height };
  }
  return out;
}

export interface CanvasNodeStyle {
  strokeColor: string;
  backgroundColor: string;
  strokeStyle: string;
}

/** User-visible styling of node shapes, so presentations match the canvas. */
export function getNodeStyles(elements: readonly ExElement[]): Record<string, CanvasNodeStyle> {
  const out: Record<string, CanvasNodeStyle> = {};
  for (const el of elements) {
    if (el.isDeleted || !SHAPE_TYPES.has(el.type)) continue;
    const c = ds(el);
    const id = c.dsKind === "node" && c.dsId ? c.dsId : el.id;
    if (out[id]) continue;
    const strokeColor = c.dsHighlight && c.dsPreHighlight ? c.dsPreHighlight.strokeColor : el.strokeColor;
    out[id] = { strokeColor, backgroundColor: el.backgroundColor, strokeStyle: el.strokeStyle };
  }
  return out;
}
