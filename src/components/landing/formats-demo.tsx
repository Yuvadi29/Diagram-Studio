"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildPresentationModel, DEFAULT_FORMATS, effectiveFormatConfig, interpolateFrame, renderFrameSvg, type PresentationFormat } from "@/features/presentations";
import { useFitBox } from "@/components/presentation/use-fit-box";
import { RAG_DEMO, RAG_SCENES } from "./demo-data";

function Screen({ format, index, progress }: { format: PresentationFormat; index: number; progress: number }) {
  const model = useMemo(() => buildPresentationModel(RAG_DEMO, format, effectiveFormatConfig(RAG_DEMO, format, DEFAULT_FORMATS[format]), { theme: "dark" }), [format]);
  const area = useRef<HTMLDivElement>(null);
  const size = useFitBox(area, model.width / model.height, 0);
  const frame = interpolateFrame(model, index > 0 ? RAG_SCENES[index - 1] : null, RAG_SCENES[index], progress, { index, total: RAG_SCENES.length });
  return (
    <figure className={`lp-screen lp-screen-${format}`}>
      <div className="lp-screen-area" ref={area}>
        <div className="lp-screen-frame" style={{ width: size.width, height: size.height }} dangerouslySetInnerHTML={{ __html: renderFrameSvg(model, frame, { responsive: true, idPrefix: `fmt-${format}` }) }} />
      </div>
      <figcaption>{format === "landscape" ? "16:9 for YouTube, courses and slides" : "9:16 for Shorts, Reels and TikTok"}</figcaption>
    </figure>
  );
}

/** Both formats, one shared scene stepper. Animation only runs when the user steps. */
export function FormatsDemo() {
  const [index, setIndex] = useState(1);
  const [progress, setProgress] = useState(1);
  const go = (next: number) => setIndex(Math.max(0, Math.min(RAG_SCENES.length - 1, next)));

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setProgress(0);
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 800);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [index]);

  return (
    <div className="lp-formats">
      <div className="lp-screens">
        <Screen format="landscape" index={index} progress={progress} />
        <Screen format="portrait" index={index} progress={progress} />
      </div>
      <div className="lp-stepper">
        <button type="button" className="lp-btn lp-btn-ghost-dark" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous scene">
          Previous
        </button>
        <ol aria-label="Scenes">
          {RAG_SCENES.map((s, i) => (
            <li key={s.id}>
              <button type="button" aria-current={i === index ? "step" : undefined} onClick={() => go(i)}>
                <span className="lp-stepper-n">{i + 1}</span> {s.title}
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="lp-btn lp-btn-ghost-dark" onClick={() => go(index + 1)} disabled={index === RAG_SCENES.length - 1} aria-label="Next scene">
          Next
        </button>
      </div>
    </div>
  );
}
