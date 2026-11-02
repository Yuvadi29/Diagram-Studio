"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFitBox } from "@/components/presentation/use-fit-box";
import { useClock, useInView, useMotion } from "./motion";
import { canvasSvg, drawingFrame, editFrame, modelsFor, presentFrame, stageSvg } from "./stage-models";
import { useTopic } from "./topic-context";
import { TOPICS } from "./topics";

/**
 * The hero's one piece of media: a Diagram Studio window that plays the whole
 * product on the visitor's chosen topic. Describe → Edit → Present (16:9) →
 * 9:16, every frame drawn by the app's own presentation renderer. It only runs
 * while visible, honours the page-wide pause and reduced motion, and the step
 * tabs let the visitor jump around.
 */

const PHASES = [
  { id: "describe", label: "Describe", ms: 5600 },
  { id: "edit", label: "Edit", ms: 4800 },
  { id: "present", label: "Present", ms: 9200 },
  { id: "portrait", label: "9:16", ms: 8400 },
] as const;
type PhaseId = (typeof PHASES)[number]["id"];
const STARTS = PHASES.reduce<number[]>((acc, p, i) => [...acc, i === 0 ? 0 : acc[i - 1] + PHASES[i - 1].ms], []);
const LOOP = STARTS[3] + PHASES[3].ms;

// Describe beats
const TYPE_MS = 1400;
const THINK_END = 2000;
const DRAW_END = 4300;
// Edit beats
const E_TYPE = 1000;
const E_DIFF = 1100;
const E_APPLY = 2100;
const E_SETTLE = 3000;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function locate(t: number): { index: number; local: number } {
  for (let i = PHASES.length - 1; i >= 0; i--) if (t >= STARTS[i]) return { index: i, local: t - STARTS[i] };
  return { index: 0, local: 0 };
}

export function ProductDemo() {
  const { topic, setTopic, pickCount } = useTopic();
  const { paused, reduced } = useMotion();
  const root = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const inView = useInView(root);
  const [clock, setClock] = useClock(inView && !paused);
  const [stillPhase, setStillPhase] = useState<PhaseId>("present");

  useEffect(() => {
    if (pickCount > 0) setClock(0);
  }, [pickCount, setClock]);

  // Reduced motion: no timeline, each step shows its finished state.
  const t = reduced ? STARTS[PHASES.findIndex((p) => p.id === stillPhase)] + PHASES.find((p) => p.id === stillPhase)!.ms - 1 : clock % LOOP;
  const { index, local } = locate(t);
  const phase = PHASES[index];
  const m = useMemo(() => modelsFor(topic), [topic]);
  const stage = phase.id === "portrait" ? m.portrait : m.landscape;
  const mode = phase.id === "describe" || phase.id === "edit" ? "canvas" : "stage";
  const aspect = mode === "canvas" ? m.canvas.width / m.canvas.height : stage.width / stage.height;
  const size = useFitBox(canvasRef, aspect, mode === "canvas" ? 0 : 12);

  let svg = "";
  if (phase.id === "describe") svg = canvasSvg(m, drawingFrame(m, (local - THINK_END) / (DRAW_END - THINK_END)), "hd");
  else if (phase.id === "edit") svg = canvasSvg(m, editFrame(m, (local - E_APPLY) / (E_SETTLE - E_APPLY)), "hd");
  else {
    const r = presentFrame(stage, topic.scenes, local / phase.ms, { tween: 0.32, instant: reduced });
    svg = stageSvg(stage, r.frame, "hs");
  }

  const status = local < TYPE_MS ? "typing" : local < THINK_END ? "thinking" : local < DRAW_END ? "drawing" : "done";
  const typed = topic.prompt.slice(0, Math.round(clamp01(local / TYPE_MS) * topic.prompt.length));
  const editTyped = topic.editPrompt.slice(0, Math.round(clamp01(local / E_TYPE) * topic.editPrompt.length));
  const applied = local >= E_APPLY;
  const added = topic.after.nodes.length - topic.before.nodes.length;

  function jump(i: number) {
    if (reduced) setStillPhase(PHASES[i].id);
    else setClock(STARTS[i] + (i === 0 ? 0 : 1));
  }

  return (
    <div className="c-demo" ref={root}>
      <div className="c-chips" role="radiogroup" aria-label="Pick a diagram for the demo">
        <span className="c-chips-label">Try it with</span>
        {TOPICS.map((tp) => (
          <button key={tp.id} type="button" role="radio" aria-checked={tp.id === topic.id} className="c-chip" onClick={() => setTopic(tp.id)}>
            {tp.label}
          </button>
        ))}
      </div>

      <div className="c-window" data-mode={mode}>
        <div className="c-window-bar">
          <span className="c-window-file">
            <span className="c-window-name">{topic.after.title}</span>
            <span className="c-window-state" data-busy={(phase.id === "describe" && status !== "done") || undefined}>
              {phase.id === "describe" && status !== "done" ? "Drawing" : "Saved"}
            </span>
          </span>
          <div className="c-segmented" aria-label="Demo steps">
            {PHASES.map((p, i) => (
              <button key={p.id} type="button" aria-pressed={i === index} onClick={() => jump(i)}>
                {p.label}
                {i === index && !reduced && <span className="c-segmented-progress" style={{ transform: `scaleX(${clamp01(local / p.ms)})` }} aria-hidden />}
              </button>
            ))}
          </div>
        </div>

        <div className="c-window-body">
          <div className="c-canvas" ref={canvasRef}>
            <div
              className="c-frame"
              role="img"
              aria-label={`Demo: the ${topic.label} diagram being drawn, edited and presented in 16:9 and 9:16.`}
              style={{ width: size.width || undefined, height: size.height || undefined }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>

          <div className="c-dock" data-open={mode === "canvas" || undefined} aria-hidden>
            {phase.id === "describe" && (
              <div className="c-dock-row">
                <p className="c-bubble">
                  {reduced ? topic.prompt : typed || <span className="c-placeholder">Describe what you want to explain</span>}
                  {!reduced && status === "typing" && <span className="c-caret" />}
                </p>
                <p className="c-status" data-status={reduced ? "done" : status}>
                  {!reduced && status === "typing" && "Typing"}
                  {!reduced && status === "thinking" && "Writing the diagram"}
                  {!reduced && status === "drawing" && "Laying it out"}
                  {(reduced || status === "done") && `${topic.before.nodes.length} components, ${topic.before.edges.length} connections`}
                </p>
              </div>
            )}
            {phase.id === "edit" && (
              <div className="c-dock-row c-dock-edit">
                <p className="c-bubble">
                  {reduced ? topic.editPrompt : editTyped}
                  {!reduced && local < E_TYPE && <span className="c-caret" />}
                </p>
                <div className="c-diff" data-on={reduced || local >= E_DIFF || undefined}>
                  <ul>
                    {topic.diff.map((d, i) => (
                      <li key={d.text} data-kind={d.kind} data-on={reduced || local >= E_DIFF + 150 * (i + 1) || undefined}>
                        <span aria-hidden>{d.kind === "add" ? "+" : "−"}</span> {d.text}
                      </li>
                    ))}
                  </ul>
                  <div className="c-diff-side">
                    {applied || reduced ? (
                      <>
                        <span className="c-diff-done">
                          {added} added
                        </span>
                        <span className="c-mini-btn">Undo</span>
                      </>
                    ) : (
                      <>
                        <span className="c-mini-btn">Discard</span>
                        <span className="c-mini-btn c-mini-btn-soft" data-pressed={local >= E_APPLY - 220 || undefined}>
                          Apply
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
