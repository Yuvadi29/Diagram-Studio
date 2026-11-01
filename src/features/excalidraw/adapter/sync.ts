import type { DiagramDSL, DiagramEdge, DiagramNode } from "../../diagrams/schema/dsl";
import { boxesOverlap, computeLayout, wrapLabel, type Box, type LayoutResult } from "../../layout";
import { GROUP_PADDING } from "../../layout/types";
import {
  absolutePoints,
  createArrow,
  createLine,
  createShape,
  createText,
  polylineMidpoint,
  toRelative,
  withVersion,
} from "./elements";
import {
  DEFAULT_STROKE_WIDTH,
  EDGE_COLOR,
  EDGE_FONT_SIZE,
  FONT_FAMILY,
  GROUP_FONT_SIZE,
  GROUP_STROKE,
  HIGHLIGHT,
  NODE_FONT_SIZE,
  NODE_STYLES,
  TEXT_COLOR,
} from "./styles";
import { SHAPE_TYPES, type DsCustomData, type ExBinding, type ExBoundElement, type ExElement, type ExPoint } from "./types";

/** Deterministic element ids derived from logical ids. */
export const elementIds = {
  node: (id: string) => `ds-n-${id}`,
  nodeText: (id: string) => `ds-nt-${id}`,
  edge: (id: string) => `ds-e-${id}`,
  edgeText: (id: string) => `ds-et-${id}`,
  group: (id: string) => `ds-g-${id}`,
  groupLabel: (id: string) => `ds-gl-${id}`,
  lifeline: (id: string) => `ds-l-${id}`,
};

export interface SceneIndex {
  nodeShape: Map<string, ExElement>;
  nodeText: Map<string, ExElement>;
  edgeArrow: Map<string, ExElement>;
  edgeText: Map<string, ExElement>;
  groupRect: Map<string, ExElement>;
  groupLabel: Map<string, ExElement>;
  lifeline: Map<string, ExElement>;
  /** Element ids owned by the DSL (everything else is user content). */
  managed: Set<string>;
  byId: Map<string, ExElement>;
}

function ds(el: ExElement): DsCustomData {
  return (el.customData ?? {}) as DsCustomData;
}

/**
 * Index a scene by logical id. Elements created by the adapter carry
 * `customData.dsKind`; shapes/arrows the user drew by hand are matched by
 * element id (that is the id `fromExcalidrawScene` assigns them).
 */
export function indexScene(elements: readonly ExElement[], diagram?: DiagramDSL): SceneIndex {
  const idx: SceneIndex = {
    nodeShape: new Map(),
    nodeText: new Map(),
    edgeArrow: new Map(),
    edgeText: new Map(),
    groupRect: new Map(),
    groupLabel: new Map(),
    lifeline: new Map(),
    managed: new Set(),
    byId: new Map(),
  };
  const live = elements.filter((e) => !e.isDeleted);
  for (const el of live) idx.byId.set(el.id, el);

  const nodeIds = new Set(diagram?.nodes.map((n) => n.id) ?? []);
  const edgeIds = new Set(diagram?.edges.map((e) => e.id) ?? []);

  for (const el of live) {
    const c = ds(el);
    if (c.dsKind && c.dsId) {
      const map =
        c.dsKind === "node"
          ? idx.nodeShape
          : c.dsKind === "edge"
            ? idx.edgeArrow
            : c.dsKind === "group"
              ? idx.groupRect
              : c.dsKind === "group-label"
                ? idx.groupLabel
                : c.dsKind === "lifeline"
                  ? idx.lifeline
                  : null;
      if (map && !map.has(c.dsId)) {
        map.set(c.dsId, el);
        idx.managed.add(el.id);
      }
      continue;
    }
    // Hand-drawn shapes/arrows that were promoted to DSL nodes/edges.
    if (SHAPE_TYPES.has(el.type) && nodeIds.has(el.id) && !idx.nodeShape.has(el.id)) {
      idx.nodeShape.set(el.id, el);
      idx.managed.add(el.id);
    } else if (el.type === "arrow" && edgeIds.has(el.id) && !idx.edgeArrow.has(el.id)) {
      idx.edgeArrow.set(el.id, el);
      idx.managed.add(el.id);
    }
  }

  // Bound labels follow their containers.
  const shapeToNode = new Map<string, string>();
  for (const [nid, el] of idx.nodeShape) shapeToNode.set(el.id, nid);
  const arrowToEdge = new Map<string, string>();
  for (const [eid, el] of idx.edgeArrow) arrowToEdge.set(el.id, eid);
  for (const el of live) {
    if (el.type !== "text" || !el.containerId) continue;
    const nid = shapeToNode.get(el.containerId);
    if (nid && !idx.nodeText.has(nid)) {
      idx.nodeText.set(nid, el);
      idx.managed.add(el.id);
      continue;
    }
    const eid = arrowToEdge.get(el.containerId);
    if (eid && !idx.edgeText.has(eid)) {
      idx.edgeText.set(eid, el);
      idx.managed.add(el.id);
    }
  }
  return idx;
}

function boxOf(el: ExElement): Box {
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

function sameBox(a: Box | undefined, b: Box | undefined): boolean {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

/** Point where the segment from the box centre towards `toward` leaves the box. */
function boxExit(box: Box, toward: ExPoint, gap = 6): ExPoint {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = toward[0] - cx;
  const dy = toward[1] - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const hw = box.width / 2 + gap;
  const hh = box.height / 2 + gap;
  const t = Math.min(dx !== 0 ? hw / Math.abs(dx) : Infinity, dy !== 0 ? hh / Math.abs(dy) : Infinity);
  return [cx + dx * t, cy + dy * t];
}

function distanceToBox([px, py]: ExPoint, b: Box): number {
  const dx = Math.max(b.x - px, 0, px - (b.x + b.width));
  const dy = Math.max(b.y - py, 0, py - (b.y + b.height));
  return Math.hypot(dx, dy);
}

function center(box: Box): ExPoint {
  return [box.x + box.width / 2, box.y + box.height / 2];
}

function straightRoute(src: Box, tgt: Box): ExPoint[] {
  if (src === tgt || sameBox(src, tgt)) {
    // Self-loop: small loop on the right side.
    const r = src.x + src.width;
    const cy = src.y + src.height / 2;
    return [
      [r + 6, cy - 12],
      [r + 50, cy - 30],
      [r + 50, cy + 30],
      [r + 6, cy + 12],
    ];
  }
  return [boxExit(src, center(tgt)), boxExit(tgt, center(src))];
}

/** Find a free spot for a new node near `candidate`, moving across the flow. */
function resolveOverlap(candidate: Box, occupied: Box[], direction: "LR" | "TB"): Box {
  const box = { ...candidate };
  for (let i = 0; i < 200; i++) {
    const hit = occupied.find((o) => boxesOverlap(box, o, 30));
    if (!hit) return box;
    if (direction === "LR") box.y = hit.y + hit.height + 40;
    else box.x = hit.x + hit.width + 40;
  }
  return box;
}

function labelText(node: DiagramNode): string {
  return wrapLabel(node.label).join("\n");
}

function centeredText(box: Box, text: string, fontSize: number) {
  const lines = text.split("\n");
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const width = Math.ceil(longest * fontSize * 0.6);
  const height = Math.ceil(lines.length * fontSize * 1.25);
  return { x: box.x + box.width / 2 - width / 2, y: box.y + box.height / 2 - height / 2, width, height };
}

export interface SyncOptions {
  /** Re-run layout for every node, discarding manual positions (explicit "rearrange"). */
  relayout?: boolean;
  /** Precomputed layout (otherwise computed from the diagram). */
  layout?: LayoutResult;
}

/**
 * Produce the Excalidraw element list for `diagram`, reusing everything that
 * already exists in `current`:
 * - existing nodes keep their position, size and user styling;
 * - new nodes are placed next to their neighbours without overlapping;
 * - removed nodes/edges disappear (with their labels);
 * - element ids are deterministic, so repeated syncs never duplicate elements;
 * - user-drawn content that is not part of the diagram is left untouched.
 */
export function syncScene(current: readonly ExElement[], diagram: DiagramDSL, options: SyncOptions = {}): ExElement[] {
  const idx = indexScene(current, diagram);
  const layout = options.layout ?? computeLayout(diagram);
  const isSequence = diagram.type === "sequence";
  const relayout = options.relayout || isSequence || idx.nodeShape.size === 0;

  // ── 1. Node boxes ────────────────────────────────────────────────────────
  const boxes = new Map<string, Box>();
  const sizeFor = (n: DiagramNode) => layout.nodes[n.id] ?? { x: 0, y: 0, width: 160, height: 72 };
  if (relayout) {
    for (const n of diagram.nodes) boxes.set(n.id, { ...sizeFor(n) });
  } else {
    for (const n of diagram.nodes) {
      const el = idx.nodeShape.get(n.id) ?? (n.type === "annotation" ? idx.byId.get(elementIds.node(n.id)) : undefined);
      if (el) boxes.set(n.id, boxOf(el));
    }
    const preserved = diagram.nodes.filter((n) => boxes.has(n.id));
    const avgDelta = (ids: string[]): [number, number] => {
      const ds = ids.filter((id) => layout.nodes[id] && boxes.has(id));
      if (!ds.length) return [0, 0];
      const sx = ds.reduce((a, id) => a + (boxes.get(id)!.x - layout.nodes[id].x), 0);
      const sy = ds.reduce((a, id) => a + (boxes.get(id)!.y - layout.nodes[id].y), 0);
      return [sx / ds.length, sy / ds.length];
    };
    const userBoxes = current
      .filter((e) => !e.isDeleted && !idx.managed.has(e.id) && SHAPE_TYPES.has(e.type))
      .map(boxOf);
    for (const n of diagram.nodes) {
      if (boxes.has(n.id)) continue;
      const neighbours = diagram.edges
        .filter((e) => e.source === n.id || e.target === n.id)
        .map((e) => (e.source === n.id ? e.target : e.source))
        .filter((id) => boxes.has(id));
      const [dx, dy] = neighbours.length ? avgDelta(neighbours) : avgDelta(preserved.map((p) => p.id));
      const base = sizeFor(n);
      const candidate = { x: Math.round(base.x + dx), y: Math.round(base.y + dy), width: base.width, height: base.height };
      boxes.set(n.id, resolveOverlap(candidate, [...boxes.values(), ...userBoxes], layout.direction));
    }
  }

  const out: ExElement[] = [];
  const created = new Map<string, ExElement>();
  const push = (prev: ExElement | undefined, next: ExElement) => {
    const el = withVersion(prev, next);
    out.push(el);
    created.set(el.id, el);
    return el;
  };

  // ── 2. Groups (drawn first so they sit behind nodes) ─────────────────────
  for (const group of diagram.groups ?? []) {
    const members = group.nodeIds.map((id) => boxes.get(id)).filter((b): b is Box => Boolean(b));
    if (!members.length) continue;
    const gb: Box = {
      x: Math.min(...members.map((b) => b.x)) - GROUP_PADDING.x,
      y: Math.min(...members.map((b) => b.y)) - GROUP_PADDING.top,
      width: 0,
      height: 0,
    };
    gb.width = Math.max(...members.map((b) => b.x + b.width)) + GROUP_PADDING.x - gb.x;
    gb.height = Math.max(...members.map((b) => b.y + b.height)) + GROUP_PADDING.bottom - gb.y;
    const prevRect = idx.groupRect.get(group.id);
    const rectId = prevRect?.id ?? elementIds.group(group.id);
    const rect = prevRect
      ? { ...prevRect, ...gb }
      : createShape(rectId, "rectangle", {
          ...gb,
          strokeColor: GROUP_STROKE,
          backgroundColor: "transparent",
          strokeStyle: "dashed",
          strokeWidth: 1,
          roughness: 0,
        });
    push(prevRect, { ...rect, customData: { ...(rect.customData ?? {}), dsKind: "group", dsId: group.id } });

    const prevLabel = idx.groupLabel.get(group.id);
    const labelId = prevLabel?.id ?? elementIds.groupLabel(group.id);
    const lw = Math.ceil(group.label.length * GROUP_FONT_SIZE * 0.6);
    const labelPos = { x: gb.x + 14, y: gb.y + 10, width: lw, height: Math.ceil(GROUP_FONT_SIZE * 1.25) };
    const label = prevLabel
      ? { ...prevLabel, ...labelPos, text: group.label, originalText: group.label }
      : createText(labelId, group.label, {
          ...labelPos,
          fontSize: GROUP_FONT_SIZE,
          fontFamily: FONT_FAMILY,
          textAlign: "left",
          verticalAlign: "top",
          strokeColor: GROUP_STROKE,
        });
    push(prevLabel, { ...label, customData: { ...(label.customData ?? {}), dsKind: "group-label", dsId: group.id } });
  }

  // ── 3. Sequence lifelines ────────────────────────────────────────────────
  if (isSequence && layout.lifelines) {
    for (const n of diagram.nodes) {
      const ll = layout.lifelines[n.id];
      const b = boxes.get(n.id);
      if (!ll || !b) continue;
      const prev = idx.lifeline.get(n.id);
      const x = b.x + b.width / 2;
      const line = createLine(prev?.id ?? elementIds.lifeline(n.id), [x, b.y + b.height], [[0, 0], [0, ll.y2 - (b.y + b.height)]], {
        strokeColor: GROUP_STROKE,
        strokeStyle: "dashed",
        strokeWidth: 1,
        roughness: 0,
        ...(prev ? { strokeColor: prev.strokeColor, strokeWidth: prev.strokeWidth, roughness: prev.roughness } : {}),
        customData: { dsKind: "lifeline", dsId: n.id },
      });
      push(prev, line);
    }
  }

  // ── 4. Nodes ─────────────────────────────────────────────────────────────
  const nodeElementId = new Map<string, string>();
  for (const n of diagram.nodes) {
    const box = boxes.get(n.id)!;
    const style = NODE_STYLES[n.type];
    const prev = idx.nodeShape.get(n.id);
    const prevCd = prev ? ds(prev) : {};

    if (style.shape === "text") {
      // Annotation: free text, no container.
      const prevText = prev && prev.type === "text" ? prev : undefined;
      const id = prevText?.id ?? elementIds.node(n.id);
      const text = n.label;
      const el = prevText
        ? { ...prevText, text, originalText: text, ...(relayout ? { x: box.x, y: box.y } : {}) }
        : createText(id, text, {
            x: box.x,
            y: box.y,
            fontSize: NODE_FONT_SIZE - 2,
            fontFamily: FONT_FAMILY,
            textAlign: "left",
            verticalAlign: "top",
            strokeColor: style.strokeColor,
          });
      push(prevText, { ...el, customData: { ...(el.customData ?? {}), dsKind: "node", dsId: n.id, dsType: n.type } });
      nodeElementId.set(n.id, id);
      continue;
    }

    const shapeId = prev && prev.type !== "text" ? prev.id : elementIds.node(n.id);
    nodeElementId.set(n.id, shapeId);
    let shape: ExElement;
    if (prev && prev.type !== "text") {
      shape = { ...prev, ...box };
      if (prev.type !== style.shape && prevCd.dsType !== n.type) shape.type = style.shape;
      // A node type change re-applies the new type's colours unless the user recoloured it.
      const prevStyle = prevCd.dsType ? NODE_STYLES[prevCd.dsType as DiagramNode["type"]] : undefined;
      if (prevStyle && prevCd.dsType !== n.type) {
        if (prev.backgroundColor === prevStyle.backgroundColor) shape.backgroundColor = style.backgroundColor;
        if (prev.strokeColor === prevStyle.strokeColor && !prevCd.dsHighlight) shape.strokeColor = style.strokeColor;
        if (prev.strokeStyle === prevStyle.strokeStyle) shape.strokeStyle = style.strokeStyle;
        shape.roundness = shape.type === "rectangle" ? { type: 3 } : { type: 2 };
      }
    } else {
      shape = createShape(shapeId, style.shape, {
        ...box,
        strokeColor: style.strokeColor,
        backgroundColor: style.backgroundColor,
        strokeStyle: style.strokeStyle,
        strokeWidth: DEFAULT_STROKE_WIDTH,
      });
    }

    // Highlight on/off, restoring whatever stroke the user had before.
    const cd: DsCustomData & Record<string, unknown> = { ...(shape.customData ?? {}), dsKind: "node", dsId: n.id, dsType: n.type };
    const wantHighlight = Boolean(n.style?.highlight);
    if (wantHighlight && !prevCd.dsHighlight) {
      cd.dsPreHighlight = { strokeColor: shape.strokeColor, strokeWidth: shape.strokeWidth };
      shape.strokeColor = HIGHLIGHT.strokeColor;
      shape.strokeWidth = HIGHLIGHT.strokeWidth;
      cd.dsHighlight = true;
    } else if (!wantHighlight && prevCd.dsHighlight) {
      shape.strokeColor = prevCd.dsPreHighlight?.strokeColor ?? style.strokeColor;
      shape.strokeWidth = prevCd.dsPreHighlight?.strokeWidth ?? DEFAULT_STROKE_WIDTH;
      delete cd.dsHighlight;
      delete cd.dsPreHighlight;
    }
    shape.customData = cd;
    push(prev && prev.type !== "text" ? prev : undefined, shape);

    const prevText = idx.nodeText.get(n.id);
    const text = labelText(n);
    const textId = prevText?.id ?? elementIds.nodeText(n.id);
    const pos = centeredText(box, text, prevText?.fontSize ?? NODE_FONT_SIZE);
    const labelChanged = prevText ? (prevText.originalText ?? prevText.text) !== n.label && prevText.text !== text : true;
    const textEl = prevText
      ? {
          ...prevText,
          ...(labelChanged ? { text, originalText: n.label } : {}),
          ...(labelChanged || !sameBox(boxOf(prev!), box) ? pos : {}),
          containerId: shapeId,
        }
      : createText(textId, text, {
          ...pos,
          originalText: n.label,
          fontSize: NODE_FONT_SIZE,
          fontFamily: FONT_FAMILY,
          strokeColor: TEXT_COLOR,
          containerId: shapeId,
        });
    push(prevText, { ...textEl, customData: { ...(textEl.customData ?? {}), dsKind: "node-label", dsId: n.id } });
  }

  // ── 5. Edges ─────────────────────────────────────────────────────────────
  const arrowsByShape = new Map<string, string[]>();
  const noteBinding = (shapeId: string, arrowId: string) => {
    arrowsByShape.set(shapeId, [...(arrowsByShape.get(shapeId) ?? []), arrowId]);
  };

  for (const edge of diagram.edges) {
    const srcBox = boxes.get(edge.source);
    const tgtBox = boxes.get(edge.target);
    const srcId = nodeElementId.get(edge.source);
    const tgtId = nodeElementId.get(edge.target);
    if (!srcBox || !tgtBox || !srcId || !tgtId) continue;
    const prev = idx.edgeArrow.get(edge.id);
    const arrowId = prev?.id ?? elementIds.edge(edge.id);

    let route: ExPoint[];
    const prevSrc = prev?.startBinding?.elementId ? idx.byId.get(prev.startBinding.elementId) : undefined;
    const prevTgt = prev?.endBinding?.elementId ? idx.byId.get(prev.endBinding.elementId) : undefined;
    const prevPoints = prev ? absolutePoints(prev) : [];
    const endpointsStill =
      !!prev &&
      !relayout &&
      prevSrc?.id === srcId &&
      prevTgt?.id === tgtId &&
      prevPoints.length >= 2 &&
      distanceToBox(prevPoints[0], srcBox) <= 24 &&
      distanceToBox(prevPoints[prevPoints.length - 1], tgtBox) <= 24;
    if (endpointsStill && prev) {
      route = absolutePoints(prev);
    } else if (relayout && layout.edges[edge.id]?.points.length) {
      route = layout.edges[edge.id].points as ExPoint[];
    } else {
      route = straightRoute(srcBox, tgtBox);
    }
    const { origin, rel } = toRelative(route);
    const bindable = !isSequence;
    const startBinding: ExBinding | null = bindable ? { elementId: srcId, focus: 0, gap: 6 } : null;
    const endBinding: ExBinding | null = bindable ? { elementId: tgtId, focus: 0, gap: 6 } : null;
    const edgeStyle = {
      strokeStyle: edge.type === "dashed" ? "dashed" : "solid",
      startArrowhead: edge.type === "bidirectional" ? "arrow" : null,
    };
    const xs = rel.map((p) => p[0]);
    const ys = rel.map((p) => p[1]);
    const geometry = {
      x: origin[0],
      y: origin[1],
      points: rel,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
    const arrow: ExElement = prev
      ? { ...prev, ...geometry, ...edgeStyle, startBinding, endBinding }
      : createArrow(arrowId, origin, rel, {
          strokeColor: EDGE_COLOR,
          strokeWidth: DEFAULT_STROKE_WIDTH,
          ...edgeStyle,
          startBinding,
          endBinding,
        });
    arrow.roundness = rel.length > 2 ? { type: 2 } : prev?.roundness ?? null;
    arrow.customData = {
      ...(arrow.customData ?? {}),
      dsKind: "edge",
      dsId: edge.id,
      dsSource: edge.source,
      dsTarget: edge.target,
    };

    const prevText = idx.edgeText.get(edge.id);
    const labelValue = edge.label?.trim();
    const arrowBound: ExBoundElement[] = [];
    if (labelValue) {
      const textId = prevText?.id ?? elementIds.edgeText(edge.id);
      const mid = polylineMidpoint(route);
      const w = Math.ceil(labelValue.length * EDGE_FONT_SIZE * 0.6);
      const h = Math.ceil(EDGE_FONT_SIZE * 1.25);
      const pos = { x: mid[0] - w / 2, y: mid[1] - h / 2, width: w, height: h };
      const textEl = prevText
        ? { ...prevText, text: labelValue, originalText: labelValue, ...(endpointsStill ? {} : pos), containerId: arrowId }
        : createText(textId, labelValue, {
            ...pos,
            fontSize: EDGE_FONT_SIZE,
            fontFamily: FONT_FAMILY,
            strokeColor: TEXT_COLOR,
            containerId: arrowId,
          });
      arrowBound.push({ id: textId, type: "text" });
      arrow.boundElements = [...(prev?.boundElements ?? []).filter((b) => b.type !== "text"), ...arrowBound];
      push(prev, arrow);
      push(prevText, { ...textEl, customData: { ...(textEl.customData ?? {}), dsKind: "edge-label", dsId: edge.id } });
    } else {
      arrow.boundElements = (prev?.boundElements ?? []).filter((b) => b.type !== "text");
      if (!arrow.boundElements.length) arrow.boundElements = null;
      push(prev, arrow);
    }
    if (bindable) {
      noteBinding(srcId, arrowId);
      noteBinding(tgtId, arrowId);
    }
  }

  // ── 6. Untouched user content ────────────────────────────────────────────
  const outputIds = new Set(out.map((e) => e.id));
  const user: ExElement[] = [];
  for (const el of current) {
    if (el.isDeleted || idx.managed.has(el.id) || outputIds.has(el.id)) continue;
    // Drop labels whose (managed) container no longer exists.
    if (el.type === "text" && el.containerId && !outputIds.has(el.containerId) && !current.some((c) => c.id === el.containerId && !idx.managed.has(c.id) && !c.isDeleted)) continue;
    let next = el;
    // Unbind user arrows from shapes that were removed.
    if (el.type === "arrow") {
      const sb = el.startBinding && !outputIds.has(el.startBinding.elementId) && idx.managed.has(el.startBinding.elementId) ? null : el.startBinding;
      const eb = el.endBinding && !outputIds.has(el.endBinding.elementId) && idx.managed.has(el.endBinding.elementId) ? null : el.endBinding;
      if (sb !== el.startBinding || eb !== el.endBinding) next = withVersion(el, { ...el, startBinding: sb ?? null, endBinding: eb ?? null });
      if (next.startBinding?.elementId) noteBinding(next.startBinding.elementId, next.id);
      if (next.endBinding?.elementId && next.endBinding.elementId !== next.startBinding?.elementId) noteBinding(next.endBinding.elementId, next.id);
    }
    user.push(next);
  }

  // ── 7. Rebuild boundElements on node shapes ──────────────────────────────
  const final = [...out, ...user];
  const finalIds = new Set(final.map((e) => e.id));
  return final.map((el) => {
    if (!SHAPE_TYPES.has(el.type)) return el;
    const nodeId = ds(el).dsKind === "node" ? ds(el).dsId : undefined;
    if (!nodeId && !arrowsByShape.has(el.id)) return el;
    const textId = nodeId ? created.get(elementIds.nodeText(nodeId))?.id ?? idx.nodeText.get(nodeId)?.id : undefined;
    const bound: ExBoundElement[] = [];
    if (textId && finalIds.has(textId)) bound.push({ id: textId, type: "text" });
    for (const a of new Set(arrowsByShape.get(el.id) ?? [])) if (finalIds.has(a)) bound.push({ id: a, type: "arrow" });
    const prevBound = JSON.stringify(el.boundElements ?? []);
    const nextBound = bound.length ? bound : null;
    if (prevBound === JSON.stringify(nextBound ?? [])) return el;
    const prevEl = current.find((c) => c.id === el.id);
    return withVersion(prevEl ?? el, { ...el, boundElements: nextBound });
  });
}

export type { DiagramEdge };
