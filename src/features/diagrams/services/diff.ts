import type { DiagramDSL, DiagramEdge, DiagramNode } from "../schema/dsl";

export interface DiagramDiff {
  addedNodes: DiagramNode[];
  removedNodes: DiagramNode[];
  updatedNodes: { before: DiagramNode; after: DiagramNode; fields: string[] }[];
  addedEdges: DiagramEdge[];
  removedEdges: DiagramEdge[];
  updatedEdges: { before: DiagramEdge; after: DiagramEdge; fields: string[] }[];
  layoutChanged: boolean;
  titleChanged: boolean;
  typeChanged: boolean;
  groupsChanged: boolean;
}

const NODE_FIELDS = ["label", "type", "description", "groupId"] as const;
const EDGE_FIELDS = ["source", "target", "label", "type"] as const;

export function diffDiagrams(before: DiagramDSL, after: DiagramDSL): DiagramDiff {
  const bNodes = new Map(before.nodes.map((n) => [n.id, n]));
  const aNodes = new Map(after.nodes.map((n) => [n.id, n]));
  const bEdges = new Map(before.edges.map((e) => [e.id, e]));
  const aEdges = new Map(after.edges.map((e) => [e.id, e]));

  const updatedNodes: DiagramDiff["updatedNodes"] = [];
  for (const [id, a] of aNodes) {
    const b = bNodes.get(id);
    if (!b) continue;
    const fields: string[] = NODE_FIELDS.filter((f) => (b[f] ?? "") !== (a[f] ?? ""));
    if (Boolean(b.style?.highlight) !== Boolean(a.style?.highlight)) fields.push("highlight");
    if (fields.length) updatedNodes.push({ before: b, after: a, fields });
  }
  const updatedEdges: DiagramDiff["updatedEdges"] = [];
  for (const [id, a] of aEdges) {
    const b = bEdges.get(id);
    if (!b) continue;
    const fields = EDGE_FIELDS.filter((f) => (b[f] ?? "") !== (a[f] ?? ""));
    if (fields.length) updatedEdges.push({ before: b, after: a, fields: [...fields] });
  }

  const groupKey = (d: DiagramDSL) =>
    JSON.stringify((d.groups ?? []).map((g) => [g.id, g.label, [...g.nodeIds].sort()]).sort());

  return {
    addedNodes: after.nodes.filter((n) => !bNodes.has(n.id)),
    removedNodes: before.nodes.filter((n) => !aNodes.has(n.id)),
    updatedNodes,
    addedEdges: after.edges.filter((e) => !bEdges.has(e.id)),
    removedEdges: before.edges.filter((e) => !aEdges.has(e.id)),
    updatedEdges,
    layoutChanged: before.layout !== after.layout,
    titleChanged: before.title !== after.title,
    typeChanged: before.type !== after.type,
    groupsChanged: groupKey(before) !== groupKey(after),
  };
}

export function isEmptyDiff(d: DiagramDiff): boolean {
  return (
    !d.addedNodes.length &&
    !d.removedNodes.length &&
    !d.updatedNodes.length &&
    !d.addedEdges.length &&
    !d.removedEdges.length &&
    !d.updatedEdges.length &&
    !d.layoutChanged &&
    !d.titleChanged &&
    !d.typeChanged &&
    !d.groupsChanged
  );
}

export function summarizeDiff(d: DiagramDiff): string {
  const parts: string[] = [];
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (d.addedNodes.length) parts.push(`added ${d.addedNodes.map((n) => n.label).join(", ")}`);
  if (d.removedNodes.length) parts.push(`removed ${d.removedNodes.map((n) => n.label).join(", ")}`);
  if (d.updatedNodes.length) parts.push(`updated ${plural(d.updatedNodes.length, "component")}`);
  if (d.addedEdges.length) parts.push(`added ${plural(d.addedEdges.length, "connection")}`);
  if (d.removedEdges.length) parts.push(`removed ${plural(d.removedEdges.length, "connection")}`);
  if (d.updatedEdges.length) parts.push(`updated ${plural(d.updatedEdges.length, "connection")}`);
  if (d.layoutChanged) parts.push("changed layout direction");
  if (d.groupsChanged) parts.push("changed groups");
  if (d.titleChanged) parts.push("renamed the diagram");
  if (d.typeChanged) parts.push("changed diagram type");
  if (!parts.length) return "No changes";
  const s = parts.join("; ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
