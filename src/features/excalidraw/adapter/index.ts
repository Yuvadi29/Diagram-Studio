import type { DiagramDSL } from "../../diagrams/schema/dsl";
import { computeLayout, type LayoutResult } from "../../layout";
import { fromExcalidrawScene } from "./from-scene";
import { syncScene, type SyncOptions } from "./sync";
import type { ExElement, ExScene } from "./types";

/**
 * The adapter between the logical DiagramDSL and native Excalidraw elements.
 * It is pure (no DOM, no Excalidraw runtime) and fully unit-tested.
 * The editor runs its output through Excalidraw's own `restoreElements`
 * before rendering, which normalises text metrics and fractional indices.
 */
export interface ExcalidrawAdapter {
  toExcalidrawElements(diagram: DiagramDSL, layout?: LayoutResult): ExElement[];
  fromExcalidrawScene(scene: ExScene, base?: DiagramDSL): DiagramDSL;
  updateExcalidrawScene(currentScene: ExScene, diagram: DiagramDSL, options?: SyncOptions): ExScene;
}

export const excalidrawAdapter: ExcalidrawAdapter = {
  toExcalidrawElements(diagram, layout) {
    return syncScene([], diagram, { relayout: true, layout: layout ?? computeLayout(diagram) });
  },
  fromExcalidrawScene(scene, base) {
    return fromExcalidrawScene(scene, base);
  },
  updateExcalidrawScene(currentScene, diagram, options) {
    return { ...currentScene, elements: syncScene(currentScene.elements, diagram, options) };
  },
};

export { syncScene, indexScene, elementIds } from "./sync";
export { fromExcalidrawScene, getNodeBoxes, getNodeStyles } from "./from-scene";
export type { CanvasNodeStyle } from "./from-scene";
export type { ExElement, ExScene } from "./types";
export { setAdapterClock } from "./elements";
