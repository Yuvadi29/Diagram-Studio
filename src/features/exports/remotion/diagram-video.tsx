import type { CalculateMetadataFunction } from "remotion";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
// NOTE: relative imports only. This file is bundled by Remotion's webpack, outside Next.js.
import { frameAtTime, totalDurationMs } from "../../presentations/playback/timeline";
import { renderFrameSvg } from "../../presentations/rendering/svg";
import type { PresentationModel } from "../../presentations/rendering/model";
import type { PresentationScene } from "../../presentations/scenes/schema";

export const VIDEO_FPS = 30;

export type VideoProps = {
  model: PresentationModel;
  scenes: PresentationScene[];
};

/**
 * Frame-driven video composition. It consumes the same serialisable
 * presentation model as the live player, so videos match playback exactly.
 * No editor is mounted during rendering.
 */
export const DiagramVideo: React.FC<VideoProps> = ({ model, scenes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const state = frameAtTime(model, scenes, (frame / fps) * 1000);
  return (
    <AbsoluteFill style={{ backgroundColor: model.background }}>
      <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: state ? renderFrameSvg(model, state, { responsive: true }) : "" }} />
    </AbsoluteFill>
  );
};

export const calculateVideoMetadata: CalculateMetadataFunction<VideoProps> = ({ props }) => ({
  fps: VIDEO_FPS,
  width: props.model.width,
  height: props.model.height,
  durationInFrames: Math.max(1, Math.ceil((totalDurationMs(props.scenes) / 1000) * VIDEO_FPS)),
});
