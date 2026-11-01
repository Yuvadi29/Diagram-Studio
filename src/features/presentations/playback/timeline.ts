import type { PresentationModel } from "../rendering/model";
import type { PresentationScene } from "../scenes/schema";
import { interpolateFrame, type FrameState } from "./frame";

export function sortScenes(scenes: PresentationScene[]): PresentationScene[] {
  return [...scenes].sort((a, b) => a.order - b.order);
}

export function totalDurationMs(scenes: PresentationScene[]): number {
  return scenes.reduce((a, s) => a + s.durationMs, 0);
}

/** Locate the scene playing at `timeMs` and the time elapsed inside it. */
export function locate(scenes: PresentationScene[], timeMs: number): { index: number; localMs: number } {
  const sorted = sortScenes(scenes);
  let acc = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (timeMs < acc + sorted[i].durationMs || i === sorted.length - 1) {
      return { index: i, localMs: Math.max(0, Math.min(timeMs - acc, sorted[i].durationMs)) };
    }
    acc += sorted[i].durationMs;
  }
  return { index: 0, localMs: 0 };
}

export function transitionProgress(scene: PresentationScene, localMs: number): number {
  if (scene.transition.type === "none" || scene.transition.durationMs <= 0) return 1;
  return Math.min(1, localMs / scene.transition.durationMs);
}

/** Deterministic frame at an absolute time (video rendering). */
export function frameAtTime(model: PresentationModel, scenes: PresentationScene[], timeMs: number): FrameState | null {
  const sorted = sortScenes(scenes);
  if (!sorted.length) return null;
  const { index, localMs } = locate(sorted, timeMs);
  return interpolateFrame(model, index > 0 ? sorted[index - 1] : null, sorted[index], transitionProgress(sorted[index], localMs), {
    index,
    total: sorted.length,
  });
}
