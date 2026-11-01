import { z } from "zod";

export const PRESENTATION_FORMATS = ["landscape", "portrait"] as const;
export type PresentationFormat = (typeof PRESENTATION_FORMATS)[number];

export const CameraSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().min(0.2).max(8),
});

/**
 * How the camera frames a scene in a given format.
 * - auto: fit the visible components (default)
 * - highlighted: zoom in on highlighted components
 * - all: show the whole diagram
 * - custom: explicit centre (diagram coordinates) and zoom relative to "all"
 */
export const CameraSettingSchema = z.object({
  mode: z.enum(["auto", "highlighted", "all", "custom"]),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  zoom: z.number().min(0.2).max(8).optional(),
});

export const TransitionSchema = z.object({
  type: z.enum(["none", "fade", "zoom"]),
  durationMs: z.number().int().min(0).max(5000),
});

const idList = z.array(z.string().min(1).max(64)).max(500);

export const PresentationSceneSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(120),
  description: z.string().max(1200).optional(),
  order: z.number().int().min(0),
  visibleNodeIds: idList,
  visibleEdgeIds: idList,
  highlightedNodeIds: idList.optional(),
  highlightedEdgeIds: idList.optional(),
  dimmedNodeIds: idList.optional(),
  /** Custom camera (landscape), kept for compatibility with the original schema. */
  camera: CameraSchema.optional(),
  /** Independent camera settings per presentation format. */
  cameraByFormat: z
    .object({ landscape: CameraSettingSchema.optional(), portrait: CameraSettingSchema.optional() })
    .optional(),
  durationMs: z.number().int().min(500).max(120_000),
  transition: TransitionSchema,
});

export type Camera = z.infer<typeof CameraSchema>;
export type CameraSetting = z.infer<typeof CameraSettingSchema>;
export type SceneTransition = z.infer<typeof TransitionSchema>;
export type PresentationScene = z.infer<typeof PresentationSceneSchema>;

export const ScenesArraySchema = z.array(PresentationSceneSchema).max(60);

export const DEFAULT_TRANSITION: SceneTransition = { type: "fade", durationMs: 600 };
export const DEFAULT_SCENE_DURATION = 5000;

export function newSceneId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `scene-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function cameraFor(scene: PresentationScene, format: PresentationFormat): CameraSetting {
  const s = scene.cameraByFormat?.[format];
  if (s) return s;
  if (format === "landscape" && scene.camera) return { mode: "custom", ...scene.camera };
  return { mode: "auto" };
}
