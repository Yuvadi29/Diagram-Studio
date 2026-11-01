export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Point = [number, number];

export interface EdgeRoute {
  points: Point[];
  labelPosition?: { x: number; y: number };
}

export interface LayoutResult {
  direction: "LR" | "TB";
  /** Top-left based boxes keyed by logical node id. */
  nodes: Record<string, Box>;
  /** Group container boxes keyed by group id. */
  groups: Record<string, Box>;
  /** Routed connectors keyed by edge id. */
  edges: Record<string, EdgeRoute>;
  /** Sequence diagrams only: vertical lifelines keyed by participant node id. */
  lifelines?: Record<string, { x: number; y1: number; y2: number }>;
  bounds: Box;
}

export interface LayoutOptions {
  /** Overrides the diagram's own layout direction. */
  direction?: "LR" | "TB";
  nodeSpacing?: number;
  rankSpacing?: number;
  /** Override computed node dimensions. */
  nodeSizes?: Record<string, { width: number; height: number }>;
  /** Make the layout more compact (used for portrait presentations). */
  compact?: boolean;
}

export const GROUP_PADDING = { x: 28, top: 44, bottom: 28 } as const;
