import type { DiagramDSL, DiagramType } from "../diagrams/schema/dsl";
import { graphLayout } from "./graph-layout";
import { sequenceLayout } from "./sequence-layout";
import type { LayoutOptions, LayoutResult } from "./types";

export type LayoutStrategy = (diagram: DiagramDSL, options?: LayoutOptions) => LayoutResult;

/**
 * Layout strategies keyed by diagram type. New diagram types can register a
 * dedicated strategy here without touching the rest of the pipeline.
 * Anything not listed uses the directed-graph (dagre) strategy.
 */
const STRATEGIES: Partial<Record<DiagramType, LayoutStrategy>> = {
  sequence: sequenceLayout,
};

export function computeLayout(diagram: DiagramDSL, options: LayoutOptions = {}): LayoutResult {
  const strategy = STRATEGIES[diagram.type] ?? graphLayout;
  return strategy(diagram, options);
}

export function boxesOverlap(a: { x: number; y: number; width: number; height: number }, b: typeof a, margin = 0): boolean {
  return (
    a.x < b.x + b.width + margin &&
    a.x + a.width + margin > b.x &&
    a.y < b.y + b.height + margin &&
    a.y + a.height + margin > b.y
  );
}

export * from "./types";
export { getNodeSize, wrapLabel, measureText } from "./sizing";
export { computeBounds } from "./graph-layout";
