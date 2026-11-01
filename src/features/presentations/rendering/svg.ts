import { wrapLabel } from "../../layout/sizing";
import type { Box, Point } from "../../layout";
import type { FrameState } from "../playback/frame";
import type { PresentationEdge, PresentationModel, PresentationNode } from "./model";

/**
 * Pure SVG renderer for presentation frames. Returns an SVG string so it can
 * be used by the live player, static scene-image export and the Remotion video
 * composition without any DOM or editor dependency.
 */

export const PRESENTATION_FONT =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const r = (n: number) => Math.round(n * 100) / 100;

function palette(model: PresentationModel) {
  return model.theme === "dark"
    ? { edge: "#9aa4b2", edgeLabelBg: "#1a1d26", edgeLabelText: "#e6e8ee", nodeText: "#1e1e1e", group: "#5c6370", groupText: "#aab2bf", accent: "#fab005", caption: "#f1f3f5", captionSub: "#aab2bf", progress: "#2a2f3a" }
    : { edge: "#495057", edgeLabelBg: "#ffffff", edgeLabelText: "#212529", nodeText: "#1e1e1e", group: "#adb5bd", groupText: "#495057", accent: "#e8590c", caption: "#111418", captionSub: "#495057", progress: "#e9ecef" };
}

function exitPoint(box: Box, toward: Point, gap = 8): Point {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = toward[0] - cx;
  const dy = toward[1] - cy;
  if (!dx && !dy) return [cx, cy];
  const t = Math.min(dx ? (box.width / 2 + gap) / Math.abs(dx) : Infinity, dy ? (box.height / 2 + gap) / Math.abs(dy) : Infinity);
  return [cx + dx * t, cy + dy * t];
}

export function edgePoints(edge: PresentationEdge, nodes: Map<string, PresentationNode>): Point[] {
  if (edge.points?.length) return edge.points;
  const s = nodes.get(edge.source)!.box;
  const t = nodes.get(edge.target)!.box;
  if (edge.source === edge.target) {
    const x = s.x + s.width;
    const y = s.y + s.height / 2;
    return [[x + 4, y - 14], [x + 54, y - 34], [x + 54, y + 34], [x + 4, y + 14]];
  }
  const sc: Point = [s.x + s.width / 2, s.y + s.height / 2];
  const tc: Point = [t.x + t.width / 2, t.y + t.height / 2];
  return [exitPoint(s, tc), exitPoint(t, sc, 12)];
}

function polylineLength(pts: Point[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

function midpoint(pts: Point[]): Point {
  const total = polylineLength(pts);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + seg >= total / 2) {
      const t = seg ? (total / 2 - acc) / seg : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }
    acc += seg;
  }
  return pts[pts.length - 1];
}

function nodeShape(n: PresentationNode, strokeWidth: number, stroke: string): string {
  const { x, y, width: w, height: h } = n.box;
  const dash = n.dashed ? ` stroke-dasharray="10 7"` : "";
  const common = `fill="${escapeXml(n.fill)}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"${dash}`;
  switch (n.type) {
    case "actor":
      return `<ellipse cx="${r(x + w / 2)}" cy="${r(y + h / 2)}" rx="${r(w / 2)}" ry="${r(h / 2)}" ${common}/>`;
    case "decision":
      return `<polygon points="${r(x + w / 2)},${r(y)} ${r(x + w)},${r(y + h / 2)} ${r(x + w / 2)},${r(y + h)} ${r(x)},${r(y + h / 2)}" ${common} stroke-linejoin="round"/>`;
    case "database": {
      const ry = Math.min(14, h * 0.18);
      return (
        `<path d="M${r(x)},${r(y + ry)} A${r(w / 2)},${r(ry)} 0 0 1 ${r(x + w)},${r(y + ry)} L${r(x + w)},${r(y + h - ry)} A${r(w / 2)},${r(ry)} 0 0 1 ${r(x)},${r(y + h - ry)} Z" ${common}/>` +
        `<path d="M${r(x)},${r(y + ry)} A${r(w / 2)},${r(ry)} 0 0 0 ${r(x + w)},${r(y + ry)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"/>`
      );
    }
    case "queue":
      return (
        `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="14" ${common}/>` +
        [0.78, 0.86].map((f) => `<line x1="${r(x + w * f)}" y1="${r(y + 8)}" x2="${r(x + w * f)}" y2="${r(y + h - 8)}" stroke="${escapeXml(stroke)}" stroke-width="1.5" opacity="0.6"/>`).join("")
      );
    case "annotation":
      return "";
    default:
      return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="14" ${common}/>`;
  }
}

function textBlock(lines: string[], cx: number, cy: number, size: number, color: string, weight = 600, anchor = "middle"): string {
  const lh = size * 1.25;
  const startY = cy - ((lines.length - 1) * lh) / 2;
  return `<text x="${r(cx)}" y="${r(startY)}" font-family="${PRESENTATION_FONT}" font-size="${size}" font-weight="${weight}" fill="${escapeXml(color)}" text-anchor="${anchor}" dominant-baseline="central">${lines
    .map((l, i) => `<tspan x="${r(cx)}" dy="${i === 0 ? 0 : r(lh)}">${escapeXml(l)}</tspan>`)
    .join("")}</text>`;
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    out.push(...wrapLabel(para, maxChars));
    if (out.length >= maxLines) break;
  }
  if (out.length > maxLines) {
    const cut = out.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].replace(/.{0,1}$/, "…");
    return cut;
  }
  return out;
}

export interface RenderOptions {
  showCaption?: boolean;
  showProgress?: boolean;
  /** Draw hit areas with data-node-id for interactive editing. */
  interactive?: boolean;
  /** Emit width/height attributes (static export) or 100% (responsive). */
  responsive?: boolean;
  /** Override the text font stack (e.g. a handwritten face for sketch previews). */
  fontFamily?: string;
  /** Hand-drawn wobble on the diagram (whiteboard look). */
  sketch?: boolean;
  /** Prefix for SVG ids, so several renders can share one HTML document. Default "ds". */
  idPrefix?: string;
}

export function renderFrameSvg(model: PresentationModel, frame: FrameState, opts: RenderOptions = {}): string {
  const { showCaption = true, showProgress = true, interactive = false, responsive = false } = opts;
  const pal = palette(model);
  const nodesById = new Map(model.nodes.map((n) => [n.id, n]));
  const vb = frame.viewBox;
  const stage = model.stage;
  const s = Math.min(stage.width / vb.width, stage.height / vb.height);
  const tx = stage.x + (stage.width - vb.width * s) / 2 - vb.x * s;
  const ty = stage.y + (stage.height - vb.height * s) / 2 - vb.y * s;
  // Keep strokes/labels readable regardless of zoom.
  const k = 1 / Math.max(0.35, Math.min(2.2, s));

  const parts: string[] = [];
  const size = responsive ? `width="100%" height="100%"` : `width="${model.width}" height="${model.height}"`;
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="0 0 ${model.width} ${model.height}" preserveAspectRatio="xMidYMid meet" style="display:block">`,
  );
  parts.push(
    `<defs>` +
      `<marker id="ds-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${pal.edge}"/></marker>` +
      `<marker id="ds-arrow-hi" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${pal.accent}"/></marker>` +
      `<filter id="ds-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
      `</defs>`,
  );
  parts.push(`<rect x="0" y="0" width="${model.width}" height="${model.height}" fill="${escapeXml(model.background)}"/>`);
  parts.push(`<g transform="translate(${r(tx)} ${r(ty)}) scale(${r(s * 1000) / 1000})">`);

  // Groups
  for (const g of model.groups) {
    const o = frame.groups[g.id] ?? 0;
    if (o <= 0.001) continue;
    const b = g.box;
    parts.push(
      `<g opacity="${r(o)}"><rect x="${r(b.x)}" y="${r(b.y)}" width="${r(b.width)}" height="${r(b.height)}" rx="18" fill="${pal.group}" fill-opacity="0.08" stroke="${pal.group}" stroke-width="${r(1.5 * k)}" stroke-dasharray="${r(8 * k)} ${r(6 * k)}"/>` +
        textBlock([g.label], b.x + 16, b.y + 20, Math.round(15 * Math.max(1, k * 0.9)), pal.groupText, 600, "start") +
        `</g>`,
    );
  }

  // Sequence lifelines
  for (const l of model.lifelines) {
    const o = frame.nodes[l.id]?.opacity ?? 0;
    if (o <= 0.001) continue;
    parts.push(`<line x1="${r(l.x)}" y1="${r(l.y1)}" x2="${r(l.x)}" y2="${r(l.y2)}" stroke="${pal.group}" stroke-width="${r(1.5 * k)}" stroke-dasharray="${r(6 * k)} ${r(6 * k)}" opacity="${r(o * 0.8)}"/>`);
  }

  // Edges
  for (const e of model.edges) {
    const v = frame.edges[e.id];
    if (!v || v.opacity <= 0.001) continue;
    const pts = edgePoints(e, nodesById);
    const len = polylineLength(pts);
    const hi = v.highlight > 0.5;
    const color = hi ? pal.accent : pal.edge;
    const width = (2 + v.highlight * 1.5) * k;
    const dashed = e.type === "dashed";
    const d = `M${pts.map((p) => `${r(p[0])},${r(p[1])}`).join(" L")}`;
    const markerEnd = v.draw > 0.98 ? ` marker-end="url(#${hi ? "ds-arrow-hi" : "ds-arrow"})"` : "";
    const markerStart = e.type === "bidirectional" && v.draw > 0.98 ? ` marker-start="url(#${hi ? "ds-arrow-hi" : "ds-arrow"})"` : "";
    const dash = dashed
      ? ` stroke-dasharray="${r(9 * k)} ${r(7 * k)}"`
      : v.draw < 0.999
        ? ` stroke-dasharray="${r(len)} ${r(len)}" stroke-dashoffset="${r(len * (1 - v.draw))}"`
        : "";
    parts.push(
      `<g opacity="${r(dashed ? v.opacity * v.draw : v.opacity)}" data-edge-id="${escapeXml(e.id)}"><path d="${d}" fill="none" stroke="${color}" stroke-width="${r(width)}" stroke-linecap="round" stroke-linejoin="round"${dash}${markerEnd}${markerStart}/>`,
    );
    if (e.label && v.draw > 0.6) {
      const [mx, my] = midpoint(pts);
      const fs = Math.round(14 * Math.max(1, k * 0.9));
      const lines = wrapText(e.label, 26, 2);
      const w = Math.max(...lines.map((l) => l.length)) * fs * 0.56 + 18;
      const h = lines.length * fs * 1.25 + 10;
      parts.push(
        `<g opacity="${r(Math.min(1, (v.draw - 0.6) / 0.4))}"><rect x="${r(mx - w / 2)}" y="${r(my - h / 2)}" width="${r(w)}" height="${r(h)}" rx="${r(h / 2)}" fill="${pal.edgeLabelBg}" stroke="${hi ? pal.accent : "none"}" stroke-width="${r(1 * k)}"/>` +
          textBlock(lines, mx, my, fs, pal.edgeLabelText, 500) +
          `</g>`,
      );
    }
    parts.push(`</g>`);
  }

  // Nodes
  for (const n of model.nodes) {
    const v = frame.nodes[n.id];
    if (!v || v.opacity <= 0.001) continue;
    const { x, y, width: w, height: h } = n.box;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const transform = v.scale !== 1 ? ` transform="translate(${r(cx)} ${r(cy)}) scale(${r(v.scale)}) translate(${r(-cx)} ${r(-cy)})"` : "";
    parts.push(`<g opacity="${r(v.opacity)}"${transform} data-node-id="${escapeXml(n.id)}"${interactive ? ` style="cursor:move"` : ""}>`);
    if (v.highlight > 0.01 && n.type !== "annotation") {
      const pad = 7 * k;
      parts.push(
        `<rect x="${r(x - pad)}" y="${r(y - pad)}" width="${r(w + pad * 2)}" height="${r(h + pad * 2)}" rx="${r(18 + pad)}" fill="none" stroke="${pal.accent}" stroke-width="${r(3 * k)}" opacity="${r(v.highlight)}" filter="url(#ds-glow)"/>`,
      );
    }
    parts.push(nodeShape(n, 2.2, n.stroke));
    const lines = wrapLabel(n.label);
    const fs = n.type === "annotation" ? 17 : 19;
    parts.push(textBlock(lines, cx, cy, fs, n.type === "annotation" ? pal.groupText : pal.nodeText, n.type === "annotation" ? 500 : 650));
    if (interactive) parts.push(`<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" fill="transparent"/>`);
    parts.push(`</g>`);
  }
  parts.push(`</g>`);

  // Caption
  if (showCaption && frame.caption.title) {
    const c = model.caption;
    const portrait = model.format === "portrait";
    const titleSize = portrait ? 54 : 46;
    const descSize = portrait ? 34 : 28;
    const maxTitleChars = Math.floor(c.width / (titleSize * 0.55));
    const maxDescChars = Math.floor(c.width / (descSize * 0.52));
    const titleLines = wrapText(frame.caption.title, maxTitleChars, 2);
    const descLines = frame.caption.description ? wrapText(frame.caption.description, maxDescChars, portrait ? 4 : 2) : [];
    const o = frame.caption.opacity;
    let cy = c.y + titleSize * 0.7;
    const stepLabel = `${frame.caption.index + 1} / ${frame.caption.total}`;
    parts.push(`<g opacity="${r(o)}">`);
    parts.push(
      `<text x="${r(c.x)}" y="${r(c.y - (portrait ? 18 : 14))}" font-family="${PRESENTATION_FONT}" font-size="${portrait ? 26 : 22}" font-weight="600" fill="${pal.accent}" letter-spacing="2">${escapeXml(stepLabel)}</text>`,
    );
    for (const line of titleLines) {
      parts.push(`<text x="${r(c.x)}" y="${r(cy)}" font-family="${PRESENTATION_FONT}" font-size="${titleSize}" font-weight="700" fill="${pal.caption}">${escapeXml(line)}</text>`);
      cy += titleSize * 1.2;
    }
    cy += descSize * 0.35;
    for (const line of descLines) {
      parts.push(`<text x="${r(c.x)}" y="${r(cy)}" font-family="${PRESENTATION_FONT}" font-size="${descSize}" font-weight="400" fill="${pal.captionSub}">${escapeXml(line)}</text>`);
      cy += descSize * 1.35;
    }
    parts.push(`</g>`);
  }

  if (showProgress && frame.caption.total > 1) {
    const total = frame.caption.total;
    const gap = 8;
    const pad = model.stage.x;
    const barW = (model.width - pad * 2 - gap * (total - 1)) / total;
    const y = model.height - Math.max(18, model.height * 0.012);
    for (let i = 0; i < total; i++) {
      const x = pad + i * (barW + gap);
      parts.push(`<rect x="${r(x)}" y="${r(y)}" width="${r(barW)}" height="6" rx="3" fill="${i <= frame.caption.index ? pal.accent : pal.progress}" opacity="${i <= frame.caption.index ? 0.9 : 1}"/>`);
    }
  }

  parts.push(`</svg>`);
  let out = parts.join("");
  if (opts.sketch) {
    out = out.replace(
      "</defs>",
      `<filter id="ds-rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${r(3.2 * k)}" xChannelSelector="R" yChannelSelector="G"/></filter></defs>`,
    );
    out = out.replace("<g transform=", `<g filter="url(#ds-rough)" transform=`);
  }
  if (opts.fontFamily) out = out.split(`font-family="${PRESENTATION_FONT}"`).join(`font-family="${escapeXml(opts.fontFamily)}"`);
  const prefix = opts.idPrefix && opts.idPrefix !== "ds" ? opts.idPrefix.replace(/[^a-zA-Z0-9_-]/g, "") : null;
  if (prefix) out = out.split('id="ds-').join(`id="${prefix}-`).split("url(#ds-").join(`url(#${prefix}-`);
  return out;
}
