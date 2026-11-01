import type { DiagramNode } from "../diagrams/schema/dsl";

export const NODE_FONT_SIZE = 18;
const CHAR_WIDTH = NODE_FONT_SIZE * 0.56;
const MAX_LINE_CHARS = 22;

/** Greedy word wrap used consistently by layout, adapter and renderer. */
export function wrapLabel(label: string, maxChars = MAX_LINE_CHARS): string[] {
  const words = label.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line) line = w;
    else if ((line + " " + w).length <= maxChars) line += " " + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  // Hard-break single words that are still too long.
  return lines.flatMap((l) => {
    if (l.length <= maxChars + 6) return [l];
    const parts: string[] = [];
    for (let i = 0; i < l.length; i += maxChars) parts.push(l.slice(i, i + maxChars));
    return parts;
  });
}

export function measureText(text: string, fontSize = NODE_FONT_SIZE): { width: number; height: number } {
  const lines = text.split("\n");
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return { width: Math.ceil(longest * fontSize * 0.56), height: Math.ceil(lines.length * fontSize * 1.25) };
}

export function getNodeSize(node: Pick<DiagramNode, "type" | "label">): { width: number; height: number } {
  const lines = wrapLabel(node.label);
  const longest = Math.max(...lines.map((l) => l.length), 4);
  const textW = longest * CHAR_WIDTH;
  const textH = lines.length * NODE_FONT_SIZE * 1.25;

  switch (node.type) {
    case "decision":
      return { width: Math.round(Math.max(170, textW * 1.7 + 40)), height: Math.round(Math.max(110, textH * 2 + 40)) };
    case "actor":
      return { width: Math.round(Math.max(150, textW * 1.35 + 40)), height: Math.round(Math.max(80, textH + 46)) };
    case "annotation":
      return { width: Math.round(Math.max(120, textW + 16)), height: Math.round(Math.max(36, textH + 12)) };
    default:
      return { width: Math.round(Math.min(320, Math.max(150, textW + 56))), height: Math.round(Math.max(72, textH + 40)) };
  }
}
