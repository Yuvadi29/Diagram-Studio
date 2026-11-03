"use client";
import { zipSync, strToU8 } from "fflate";
import type { DiagramDSL } from "@/features/diagrams/schema/dsl";
import {
  buildPresentationModel,
  effectiveFormatConfig,
  renderFrameSvg,
  staticFrame,
  type NodeColor,
  type PresentationFormat,
  type PresentationFormatConfig,
  type PresentationScene,
} from "@/features/presentations";
import type { Box } from "@/features/layout";
import { downloadBlob, safeFilename } from "@/lib/utils/format";

/** Rasterise an SVG string to PNG at its intrinsic size. */
export async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not render scene image."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed."))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface SceneExportInput {
  title: string;
  diagram: DiagramDSL;
  scenes: PresentationScene[];
  format: PresentationFormat;
  config: PresentationFormatConfig;
  colors?: Record<string, NodeColor>;
  editorBoxes?: Record<string, Box>;
}

/** One PNG + SVG per scene, zipped. */
export async function exportSceneImages(input: SceneExportInput, onProgress?: (done: number, total: number) => void) {
  const cfg = effectiveFormatConfig(input.diagram, input.format, input.config, input.editorBoxes);
  const model = buildPresentationModel(input.diagram, input.format, cfg, { colors: input.colors, editorBoxes: input.editorBoxes });
  const sorted = [...input.scenes].sort((a, b) => a.order - b.order);
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < sorted.length; i++) {
    const svg = renderFrameSvg(model, staticFrame(model, sorted[i], { index: i, total: sorted.length }));
    const name = `${String(i + 1).padStart(2, "0")}-${safeFilename(sorted[i].title, "scene")}`;
    files[`svg/${name}.svg`] = strToU8(svg);
    const png = await svgToPng(svg, model.width, model.height);
    files[`png/${name}.png`] = new Uint8Array(await png.arrayBuffer());
    onProgress?.(i + 1, sorted.length);
  }
  const zipped = zipSync(files, { level: 0 });
  downloadBlob(new Blob([zipped as BlobPart], { type: "application/zip" }), `${safeFilename(input.title)}-${input.format}-scenes.zip`);
}

export function exportProjectJson(data: {
  title: string;
  diagram: DiagramDSL;
  excalidraw: { elements: unknown[]; appState?: unknown; files?: unknown };
  presentation?: unknown;
  scenes?: PresentationScene[];
}) {
  const payload = {
    format: "flowdeck-project",
    version: 1,
    exportedAt: new Date().toISOString(),
    title: data.title,
    diagram: data.diagram,
    excalidraw: data.excalidraw,
    presentation: data.presentation ?? null,
    scenes: data.scenes ?? [],
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${safeFilename(data.title)}.flowdeck.json`);
}
