"use client";
import { useMemo, useRef, useState } from "react";
import {
  buildPresentationModel,
  DEFAULT_FORMATS,
  effectiveFormatConfig,
  interpolateFrame,
  renderFrameSvg,
  revealLevels,
  type PresentationFormat,
  type PresentationModel,
  type PresentationScene,
} from "@/features/presentations";
import { useFitBox } from "@/components/presentation/use-fit-box";
import { DEMO_PROMPT, RAG_DEMO, RAG_SCENES } from "./demo-data";
import { useClock, useInView, useMotion } from "./motion";

// ── Timeline (ms) ───────────────────────────────────────────────────────────
const TYPE_END = 2300;
const DRAW_START = 3000;
const LEVEL_MS = 430;
const LEVELS = revealLevels(RAG_DEMO);
const SKETCH_DONE = DRAW_START + LEVELS.length * LEVEL_MS + 300;
const PRESENT_AT = SKETCH_DONE + 1600;
const SCENE_MS = 3000;
const PORTRAIT_FROM = 2; // scenes 3 and 4 play in 9:16
const LOOP_MS = PRESENT_AT + RAG_SCENES.length * SCENE_MS + 1800;
/** Where the reduced-motion / no-JS view sits: the final presented scene. */
const STILL_T = PRESENT_AT + (RAG_SCENES.length - 1) * SCENE_MS + 2000;

/** Progressive "drawing" scenes: one per flow level, camera fixed on the whole diagram. */
const SKETCH_STEPS: PresentationScene[] = (() => {
  const visible: string[] = [];
  return LEVELS.map((level, i) => {
    visible.push(...level);
    const set = new Set(visible);
    return {
      id: `sk${i}`,
      title: "",
      order: i,
      visibleNodeIds: [...visible],
      visibleEdgeIds: RAG_DEMO.edges.filter((e) => set.has(e.source) && set.has(e.target)).map((e) => e.id),
      cameraByFormat: { landscape: { mode: "all" }, portrait: { mode: "all" } },
      durationMs: LEVEL_MS,
      transition: { type: "fade", durationMs: LEVEL_MS },
    } satisfies PresentationScene;
  });
})();

function sketchModel(): PresentationModel {
  const cfg = { ...DEFAULT_FORMATS.landscape, backgroundColor: "transparent", padding: 70 };
  const m = buildPresentationModel(RAG_DEMO, "landscape", effectiveFormatConfig(RAG_DEMO, "landscape", cfg), { theme: "light" });
  return { ...m, stage: { x: 70, y: 70, width: m.width - 140, height: m.height - 140 } };
}

function stageModel(f: PresentationFormat): PresentationModel {
  const cfg = { ...DEFAULT_FORMATS[f], backgroundColor: "#0f1117" };
  return buildPresentationModel(RAG_DEMO, f, effectiveFormatConfig(RAG_DEMO, f, cfg), { theme: "dark" });
}

export function HeroMachine() {
  const root = useRef<HTMLDivElement>(null);
  const frameArea = useRef<HTMLDivElement>(null);
  const inView = useInView(root);
  const { paused, reduced } = useMotion();
  const [clock, setClock] = useClock(inView && !paused);
  const [pinnedFormat, setPinnedFormat] = useState<PresentationFormat | null>(null);

  const models = useMemo(() => ({ sketch: sketchModel(), landscape: stageModel("landscape"), portrait: stageModel("portrait") }), []);

  const t = reduced ? STILL_T : clock % LOOP_MS;
  const phase: "typing" | "drawing" | "sketch" | "present" = t < DRAW_START ? (t < TYPE_END ? "typing" : "drawing") : t < PRESENT_AT ? "sketch" : "present";
  const sceneIndex = phase === "present" ? Math.min(RAG_SCENES.length - 1, Math.floor((t - PRESENT_AT) / SCENE_MS)) : 0;
  const autoFormat: PresentationFormat = sceneIndex >= PORTRAIT_FROM && t < LOOP_MS - 900 ? "portrait" : "landscape";
  const format: PresentationFormat = pinnedFormat ?? autoFormat;
  const model = phase === "present" ? models[format] : models.sketch;
  const size = useFitBox(frameArea, model.width / model.height, 0);

  let svg = "";
  if (phase === "sketch" || phase === "drawing") {
    if (phase === "sketch") {
      const local = t - DRAW_START;
      const i = Math.min(SKETCH_STEPS.length - 1, Math.floor(local / LEVEL_MS));
      const p = Math.min(1, (local - i * LEVEL_MS) / LEVEL_MS);
      const frame = interpolateFrame(models.sketch, i > 0 ? SKETCH_STEPS[i - 1] : null, SKETCH_STEPS[i], p, { index: 0, total: 1 });
      svg = renderFrameSvg(models.sketch, frame, { responsive: true, sketch: true, showCaption: false, showProgress: false, idPrefix: "hero-sk" });
    }
  } else if (phase === "present") {
    const local = t - PRESENT_AT - sceneIndex * SCENE_MS;
    const sc = RAG_SCENES[sceneIndex];
    const formatJustChanged = !pinnedFormat && sceneIndex === PORTRAIT_FROM;
    const from = sceneIndex > 0 && !formatJustChanged ? RAG_SCENES[sceneIndex - 1] : null;
    const p = Math.min(1, local / sc.transition.durationMs);
    const frame = interpolateFrame(model, from, sc, p, { index: sceneIndex, total: RAG_SCENES.length });
    svg = renderFrameSvg(model, frame, { responsive: true, idPrefix: "hero-st" });
  }

  const typed = phase === "typing" ? DEMO_PROMPT.slice(0, Math.round((t / TYPE_END) * DEMO_PROMPT.length)) : DEMO_PROMPT;
  const status = phase === "typing" ? "Describe" : phase === "drawing" ? "Drawing" : phase === "sketch" ? "Edit" : "Present";

  return (
    <div ref={root} className="lp-machine" data-phase={phase} data-format={phase === "present" ? format : "sketch"}>
      <div className="lp-machine-bar">
        <div className="lp-prompt" aria-hidden>
          <span className="lp-prompt-text">{typed}</span>
          {phase === "typing" && <span className="lp-caret" />}
          {phase === "drawing" && <span className="lp-prompt-busy">Drawing your diagram…</span>}
        </div>
        <ol className="lp-steps" aria-label="Demo progress">
          {["Describe", "Edit", "Present"].map((s) => (
            <li key={s} aria-current={status === s || (s === "Describe" && status === "Drawing") ? "step" : undefined}>
              {s}
            </li>
          ))}
        </ol>
      </div>

      <div className="lp-machine-body" ref={frameArea} role="img" aria-label="Demo: a prompt becomes an editable RAG architecture diagram, then plays as a step-by-step presentation in 16:9 and 9:16.">
        <div className="lp-frame" data-format={phase === "present" ? format : "sketch"} style={{ width: size.width, height: size.height }} dangerouslySetInnerHTML={{ __html: svg }} />
        {phase === "typing" && <p className="lp-canvas-hint">Excalidraw canvas</p>}
      </div>

      <div className="lp-machine-foot">
        <div className="lp-format-switch" role="radiogroup" aria-label="Presentation format">
          {(["landscape", "portrait"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={phase === "present" ? format === f : f === "landscape"}
              onClick={() => {
                setPinnedFormat(f);
                if (phase !== "present") setClock(PRESENT_AT + 1);
              }}
            >
              {f === "landscape" ? "16:9" : "9:16"}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="lp-text-button"
          onClick={() => {
            setPinnedFormat(null);
            setClock(0);
          }}
        >
          Replay
        </button>
      </div>

      <p className="lp-note lp-note-edit" aria-hidden>
        a real Excalidraw diagram.
        <br />
        drag it, restyle it.
      </p>
      <p className="lp-note lp-note-portrait" aria-hidden>
        same diagram,
        <br />
        its own 9:16 layout
      </p>
    </div>
  );
}
