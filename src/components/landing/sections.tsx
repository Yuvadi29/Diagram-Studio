"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { staticFrame, type PresentationFormat } from "@/features/presentations";
import { useFitBox } from "@/components/presentation/use-fit-box";
import { useMotion } from "./motion";
import { canvasSvg, editFrame, modelsFor, presentFrame, stageSvg } from "./stage-models";
import { useTopic } from "./topic-context";

/** Three steps, each illustrated with a real render of the chosen topic. */
export function HowItWorks() {
  const { topic } = useTopic();
  const m = useMemo(() => modelsFor(topic), [topic]);
  const shots = useMemo(
    () => [
      canvasSvg(m, staticFrame(m.canvas, m.beforeScene), "how1"),
      canvasSvg(m, editFrame(m, 1), "how2"),
      stageSvg(m.landscape, staticFrame(m.landscape, topic.scenes[1], { index: 1, total: topic.scenes.length }), "how3"),
    ],
    [m, topic.scenes],
  );
  const steps = [
    { title: "Describe it", body: <>Write a sentence or a paragraph. The AI writes a validated diagram spec and a layout engine places every component.</>, quote: topic.prompt },
    { title: "Shape it", body: <>Drag things on a real Excalidraw canvas, or ask for a change. You see a preview before anything moves.</>, quote: topic.editPrompt },
    { title: "Present it", body: <>Scenes reveal one idea at a time, with highlights and a camera that follows the story.</>, quote: `${topic.scenes.length} scenes, 16:9 and 9:16` },
  ];
  return (
    <ol className="c-steps">
      {steps.map((s, i) => (
        <li key={s.title} className="c-card c-step">
          <div className="c-step-shot" data-dark={i === 2 || undefined} dangerouslySetInnerHTML={{ __html: shots[i] }} />
          <div className="c-step-text">
            <h3>
              <span className="c-step-n">{i + 1}</span>
              {s.title}
            </h3>
            <p>{s.body}</p>
            <p className="c-step-quote">“{s.quote}”</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Screen({ format, index, progress }: { format: PresentationFormat; index: number; progress: number }) {
  const { topic } = useTopic();
  const m = useMemo(() => modelsFor(topic), [topic]);
  const model = format === "portrait" ? m.portrait : m.landscape;
  const area = useRef<HTMLDivElement>(null);
  const size = useFitBox(area, model.width / model.height, 0);
  const n = topic.scenes.length;
  // presentFrame takes overall progress; place it inside scene `index`.
  const { frame } = presentFrame(model, topic.scenes, (index + Math.min(0.999, progress * 0.5)) / n, { tween: 0.5 });
  return (
    <figure className={`c-screen c-screen-${format}`}>
      <div className="c-screen-area" ref={area}>
        <div
          className="c-screen-frame"
          style={{ width: size.width || undefined, height: size.height || undefined }}
          dangerouslySetInnerHTML={{ __html: stageSvg(model, frame, `fmt-${format}`) }}
        />
      </div>
      <figcaption>{format === "landscape" ? "16:9 for YouTube, courses and slides" : "9:16 for Shorts, Reels and TikTok"}</figcaption>
    </figure>
  );
}

/** Both formats side by side, one shared scene stepper. Animates only when the visitor steps. */
export function FormatsDemo() {
  const { topic } = useTopic();
  const { reduced } = useMotion();
  const [index, setIndex] = useState(1);
  const [progress, setProgress] = useState(1);
  const n = topic.scenes.length;

  useEffect(() => {
    if (reduced) return setProgress(1);
    setProgress(0);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 700);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, topic.id, reduced]);

  return (
    <div className="c-formats">
      <div className="c-formats-stage">
        <Screen format="landscape" index={index} progress={progress} />
        <Screen format="portrait" index={index} progress={progress} />
      </div>
      <div className="c-stepper">
        <button type="button" className="c-btn c-btn-outline c-btn-md" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
          Previous scene
        </button>
        <p aria-live="polite">
          <span className="c-stepper-count">
            {index + 1} of {n}
          </span>
          {topic.scenes[index].title}
        </p>
        <button type="button" className="c-btn c-btn-outline c-btn-md" onClick={() => setIndex((i) => Math.min(n - 1, i + 1))} disabled={index === n - 1}>
          Next scene
        </button>
      </div>
    </div>
  );
}
