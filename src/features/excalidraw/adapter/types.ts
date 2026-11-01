/**
 * Structural types for the subset of Excalidraw's element format the adapter
 * reads and writes. They mirror the real `@excalidraw/excalidraw` element
 * shape (v0.18) but are declared locally so the adapter stays independent of
 * the editor package and can be unit-tested in plain Node.
 *
 * Only real, supported Excalidraw element properties are used. Our own
 * bookkeeping lives in `customData`, which Excalidraw persists verbatim.
 */

export interface ExBinding {
  elementId: string;
  focus: number;
  gap: number;
  fixedPoint?: [number, number] | null;
}

export interface ExBoundElement {
  id: string;
  type: "arrow" | "text";
}

export type ExPoint = [number, number];

export interface ExElement {
  id: string;
  type: "rectangle" | "ellipse" | "diamond" | "text" | "arrow" | "line" | (string & {});
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  index: string | null;
  roundness: { type: number; value?: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: ExBoundElement[] | null;
  updated: number;
  link: string | null;
  locked: boolean;
  customData?: DsCustomData & Record<string, unknown>;
  // text
  text?: string;
  originalText?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  containerId?: string | null;
  autoResize?: boolean;
  lineHeight?: number;
  // linear (arrow / line)
  points?: ExPoint[];
  lastCommittedPoint?: ExPoint | null;
  startBinding?: ExBinding | null;
  endBinding?: ExBinding | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  elbowed?: boolean;
  [key: string]: unknown;
}

export type DsKind = "node" | "node-label" | "edge" | "edge-label" | "group" | "group-label" | "lifeline";

export interface DsCustomData {
  dsKind?: DsKind;
  /** Logical id (node, edge or group id). */
  dsId?: string;
  /** Node type at the time of the last sync. */
  dsType?: string;
  /** Edge endpoints (used when an arrow is not bound, e.g. sequence messages). */
  dsSource?: string;
  dsTarget?: string;
  dsHighlight?: boolean;
  dsPreHighlight?: { strokeColor: string; strokeWidth: number };
}

export interface ExScene {
  elements: readonly ExElement[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

export const SHAPE_TYPES = new Set(["rectangle", "ellipse", "diamond"]);
