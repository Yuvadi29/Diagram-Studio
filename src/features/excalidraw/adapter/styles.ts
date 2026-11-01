import type { NodeType } from "../../diagrams/schema/dsl";

/** Map logical node types onto native Excalidraw shapes and palette colours. */
export interface NodeStyle {
  shape: "rectangle" | "ellipse" | "diamond" | "text";
  strokeColor: string;
  backgroundColor: string;
  strokeStyle: "solid" | "dashed";
}

// Colours from Excalidraw's built-in palette (they invert nicely in dark mode).
export const NODE_STYLES: Record<NodeType, NodeStyle> = {
  actor: { shape: "ellipse", strokeColor: "#2f9e44", backgroundColor: "#b2f2bb", strokeStyle: "solid" },
  service: { shape: "rectangle", strokeColor: "#1971c2", backgroundColor: "#a5d8ff", strokeStyle: "solid" },
  database: { shape: "rectangle", strokeColor: "#6741d9", backgroundColor: "#d0bfff", strokeStyle: "solid" },
  queue: { shape: "rectangle", strokeColor: "#f08c00", backgroundColor: "#ffec99", strokeStyle: "solid" },
  cache: { shape: "rectangle", strokeColor: "#c2255c", backgroundColor: "#fcc2d7", strokeStyle: "solid" },
  gateway: { shape: "rectangle", strokeColor: "#0c8599", backgroundColor: "#99e9f2", strokeStyle: "solid" },
  process: { shape: "rectangle", strokeColor: "#495057", backgroundColor: "#e9ecef", strokeStyle: "solid" },
  decision: { shape: "diamond", strokeColor: "#e8590c", backgroundColor: "#ffd8a8", strokeStyle: "solid" },
  "external-system": { shape: "rectangle", strokeColor: "#868e96", backgroundColor: "#f1f3f5", strokeStyle: "dashed" },
  component: { shape: "rectangle", strokeColor: "#3b5bdb", backgroundColor: "#bac8ff", strokeStyle: "solid" },
  annotation: { shape: "text", strokeColor: "#868e96", backgroundColor: "transparent", strokeStyle: "solid" },
};

export const TEXT_COLOR = "#1e1e1e";
export const EDGE_COLOR = "#495057";
export const GROUP_STROKE = "#868e96";
export const HIGHLIGHT = { strokeColor: "#e03131", strokeWidth: 4 } as const;
export const DEFAULT_STROKE_WIDTH = 2;
/** Excalifont (Excalidraw's default hand-drawn font in v0.18). */
export const FONT_FAMILY = 5;
export const NODE_FONT_SIZE = 18;
export const EDGE_FONT_SIZE = 14;
export const GROUP_FONT_SIZE = 16;
