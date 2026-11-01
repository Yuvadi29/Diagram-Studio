import { Composition } from "remotion";
import { calculateVideoMetadata, DiagramVideo, VIDEO_FPS, type VideoProps } from "./diagram-video";
import { sampleVideoProps } from "./sample";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="DiagramVideo"
    component={DiagramVideo}
    fps={VIDEO_FPS}
    width={1920}
    height={1080}
    durationInFrames={300}
    defaultProps={sampleVideoProps as VideoProps}
    calculateMetadata={calculateVideoMetadata}
  />
);
