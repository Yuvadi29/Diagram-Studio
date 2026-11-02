"use client";
/**
 * Thin bridge between the pure adapter and the live Excalidraw editor.
 * Excalidraw is imported lazily because it only runs in the browser.
 */
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { DiagramDSL } from "@/features/diagrams/schema/dsl";
import { syncScene, type ExElement } from "../adapter";
import type { SyncOptions } from "../adapter/sync";

export type ExcalidrawAPI = ExcalidrawImperativeAPI;

type ExcalidrawModule = typeof import("@excalidraw/excalidraw");
let modPromise: Promise<ExcalidrawModule> | null = null;
export function loadExcalidraw(): Promise<ExcalidrawModule> {
  modPromise ??= import("@excalidraw/excalidraw");
  return modPromise;
}

export function getElements(api: ExcalidrawAPI): ExElement[] {
  return api.getSceneElements() as unknown as ExElement[];
}

/** Cheap change detector: sum of element versions (+count) including deleted ones. */
export function sceneVersion(elements: readonly { version: number }[]): number {
  let v = elements.length;
  for (const e of elements) v += e.version;
  return v;
}

/** Normalise elements with Excalidraw's own restore (text metrics, bindings, indices). */
export async function restore(elements: unknown[]): Promise<unknown[]> {
  const mod = await loadExcalidraw();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return mod.restoreElements(elements as any, null, { refreshDimensions: true, repairBindings: true }) as unknown[];
}

/** Replace scene elements as a single undoable step. */
export async function setSceneElements(api: ExcalidrawAPI, elements: unknown[], { undoable = true } = {}) {
  const mod = await loadExcalidraw();
  const restored = (await restore(elements)) as { id: string; version: number; versionNonce: number }[];
  // Older snapshots (undo, version restore, drafts) must still win over what's on
  // screen: give every element a version newer than its current counterpart.
  const current = new Map(api.getSceneElementsIncludingDeleted().map((e) => [e.id, e.version]));
  for (const el of restored) {
    const cur = current.get(el.id);
    if (cur !== undefined && cur >= el.version) {
      el.version = cur + 1;
      el.versionNonce = Math.floor(Math.random() * 2 ** 31);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = mod as any;
  const capture = undoable ? (m.CaptureUpdateAction?.IMMEDIATELY ?? "IMMEDIATELY") : (m.CaptureUpdateAction?.NEVER ?? "NEVER");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api.updateScene({ elements: restored as any, captureUpdate: capture } as any);
}

/** Apply a DSL to the canvas through the adapter, preserving manual work. */
export async function applyDiagramToCanvas(api: ExcalidrawAPI, diagram: DiagramDSL, options: SyncOptions = {}) {
  const current = getElements(api);
  const next = syncScene(current, diagram, options);
  await setSceneElements(api, next);
  if (current.length === 0 || options.relayout) {
    requestAnimationFrame(() => fitView(api, { animate: true }));
  }
}

/** Frame the whole scene in the viewport (never zooming in past 100%). */
export function fitView(api: ExcalidrawAPI, { animate = false } = {}) {
  if (!api.getSceneElements().length) return;
  api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.85, maxZoom: 1, animate });
}

export function selectElements(api: ExcalidrawAPI, ids: string[]) {
  const selectedElementIds = Object.fromEntries(ids.map((id) => [id, true as const]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api.updateScene({ appState: { selectedElementIds } as any });
  const els = api.getSceneElements().filter((e) => ids.includes(e.id));
  if (els.length) api.scrollToContent(els, { fitToContent: false, animate: true });
}

/** Trigger Excalidraw's own undo/redo (its history isn't exposed on the API). */
export function triggerHistory(kind: "undo" | "redo") {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const ev = new KeyboardEvent("keydown", {
    key: "z",
    code: "KeyZ",
    shiftKey: kind === "redo",
    metaKey: isMac,
    ctrlKey: !isMac,
    bubbles: true,
    cancelable: true,
  });
  (document.querySelector(".excalidraw") ?? document).dispatchEvent(ev);
}

export async function exportPng(api: ExcalidrawAPI, { dark = false, scale = 2 } = {}): Promise<Blob> {
  const { exportToBlob } = await loadExcalidraw();
  return exportToBlob({
    elements: api.getSceneElements(),
    appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: dark, exportScale: scale },
    files: api.getFiles(),
    mimeType: "image/png",
    exportPadding: 32,
  });
}

export async function exportSvg(api: ExcalidrawAPI, { dark = false } = {}): Promise<Blob> {
  const { exportToSvg } = await loadExcalidraw();
  const svg = await exportToSvg({
    elements: api.getSceneElements(),
    appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: dark },
    files: api.getFiles(),
    exportPadding: 32,
  });
  return new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
}

export async function exportExcalidrawFile(api: ExcalidrawAPI): Promise<Blob> {
  const { serializeAsJSON } = await loadExcalidraw();
  const json = serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), "local");
  return new Blob([json], { type: "application/json" });
}

/** Small preview image stored on the project for the dashboard. */
export async function makeThumbnail(api: ExcalidrawAPI): Promise<string | null> {
  const elements = api.getSceneElements();
  if (!elements.length) return null;
  const { exportToBlob } = await loadExcalidraw();
  const blob = await exportToBlob({
    elements,
    appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false, viewBackgroundColor: "#ffffff" },
    files: api.getFiles(),
    mimeType: "image/webp",
    quality: 0.6,
    exportPadding: 24,
    getDimensions: (width: number, height: number) => {
      const scale = Math.min(1, 420 / Math.max(width, height));
      return { width: width * scale, height: height * scale, scale };
    },
  });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  // Keep dashboard payloads small: previews are loaded for every project card.
  return dataUrl.length < 80_000 ? dataUrl : null;
}
