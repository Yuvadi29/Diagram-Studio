"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { frameAtTime, staticFrame, totalDurationMs } from "@/features/presentations";
import { useClock, useInView, useMotion } from "./motion";
import { canvasSvg, modelsFor, stageSvg } from "./stage-models";
import { useTopic } from "./topic-context";

const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The real files the visitor's topic would produce, rendered by the same engine. */
export function ExportsShowcase() {
  const { topic } = useTopic();
  const { reduced } = useMotion();
  const m = useMemo(() => modelsFor(topic), [topic]);
  const total = totalDurationMs(topic.scenes);
  const last = topic.scenes.length - 1;

  // The video only plays when asked to.
  const root = useRef<HTMLDivElement>(null);
  const inView = useInView(root);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useClock(playing && inView);
  useEffect(() => {
    if (t >= total) {
      setPlaying(false);
      setT(total);
    }
  }, [t, total, setT]);
  useEffect(() => {
    setPlaying(false);
    setT(total);
  }, [topic.id, total, setT]);

  const videoFrame = useMemo(() => {
    const f = t >= total ? staticFrame(m.landscape, topic.scenes[last], { index: last, total: last + 1 }) : frameAtTime(m.landscape, topic.scenes, t);
    return f ? stageSvg(m.landscape, f, "exv") : "";
  }, [m, topic.scenes, t, total, last]);

  const portrait = useMemo(() => stageSvg(m.portrait, staticFrame(m.portrait, topic.scenes[2], { index: 2, total: last + 1 }), "exp"), [m, topic.scenes, last]);
  const stills = useMemo(
    () =>
      topic.scenes.map((s, i) => stageSvg(m.landscape, staticFrame(m.landscape, s, { index: i, total: last + 1 }), `exs${i}`, { showProgress: false })),
    [m, topic.scenes, last],
  );
  const png = useMemo(() => canvasSvg(m, staticFrame(m.canvas, m.plainAfter), "expng"), [m]);

  const shown = t >= total ? total : t;

  return (
    <div className="ex" ref={root}>
      <figure className="ex-video">
        <div className="ex-video-screen" dangerouslySetInnerHTML={{ __html: videoFrame }} />
        <div className="ex-video-bar">
          <button
            type="button"
            className="ex-play"
            aria-label={playing ? "Pause video preview" : "Play video preview"}
            onClick={() => {
              if (playing) return setPlaying(false);
              if (t >= total) setT(0);
              setPlaying(true);
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden>
              {playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M4 2.5v11l9-5.5z" />}
            </svg>
          </button>
          <span className="ex-track" aria-hidden>
            <span style={{ width: `${(shown / total) * 100}%`, transition: reduced ? "none" : undefined }} />
          </span>
          <span className="ex-time">
            {fmtTime(shown)} / {fmtTime(total)}
          </span>
        </div>
        <figcaption>
          <span className="ex-file">{topic.file}.mp4</span>
          <span>MP4, 1920 × 1080, for YouTube and courses</span>
        </figcaption>
      </figure>

      <figure className="ex-phone">
        <div className="ex-phone-screen" dangerouslySetInnerHTML={{ __html: portrait }} />
        <figcaption>
          <span className="ex-file">{topic.file}-shorts.mp4</span>
          <span>MP4, 1080 × 1920, for Shorts, Reels and TikTok</span>
        </figcaption>
      </figure>

      <figure className="ex-stills">
        <ol>
          {stills.map((s, i) => (
            <li key={topic.scenes[i].id}>
              <div className="ex-still" dangerouslySetInnerHTML={{ __html: s }} />
              <span>scene-{i + 1}.png</span>
            </li>
          ))}
        </ol>
        <figcaption>
          <span className="ex-file">{topic.file}-scenes.zip</span>
          <span>Every scene as PNG and SVG, for slides and thumbnails</span>
        </figcaption>
      </figure>

      <figure className="ex-doc">
        <div className="ex-doc-page">
          <div className="ex-doc-lines" aria-hidden>
            <i />
            <i />
            <i />
          </div>
          <div className="ex-doc-img" dangerouslySetInnerHTML={{ __html: png }} />
          <div className="ex-doc-lines" aria-hidden>
            <i />
            <i />
          </div>
        </div>
        <figcaption>
          <span className="ex-file">{topic.file}.png, .svg and .excalidraw</span>
          <span>The diagram itself, for docs, READMEs and further editing</span>
        </figcaption>
      </figure>
    </div>
  );
}
