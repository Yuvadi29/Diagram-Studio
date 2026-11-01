"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { PresentationFormat } from "@/features/presentations";
import { LogoMark } from "@/components/shared/logo";
import { useFitBox } from "@/components/presentation/use-fit-box";
import { useClock, useInView, useMotion } from "./motion";
import { canvasSvg, drawingFrame, editFrame, modelsFor, presentFrame, stageSvg } from "./stage-models";
import { useTopic } from "./topic-context";
import { TOPICS } from "./topics";

/**
 * The page's one signature moment: a pinned Diagram Studio window that follows
 * the copy. The hero draws the visitor's chosen diagram (time-based, once),
 * then scrolling paces the rest of the story: an AI edit lands, the page
 * "lights down" and the same diagram plays as a presentation, then flips to
 * 9:16. Every frame comes from the product's own presentation renderer.
 */

const CHAPTERS = [
  { id: "describe", label: "Describe" },
  { id: "edit", label: "Edit" },
  { id: "present", label: "Present" },
  { id: "formats", label: "Formats" },
] as const;

const NOTES = ["a real Excalidraw canvas. drag anything.", "the new part slides in. nothing else moves.", "the camera follows the story", "its own vertical layout, not a crop"];

// Hero timeline (ms)
const TYPE_MS = 1500;
const THINK_MS = 700;
const DRAW_MS = 2300;
const HERO_END = TYPE_MS + THINK_MS + DRAW_MS;

// Edit chapter beats (share of the chapter's scroll)
const E_TYPE = 0.14;
const E_DIFF = 0.17;
const E_APPLY = 0.4;
const E_SETTLE = 0.75;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Which chapter crosses the reading line, and how far through it we are (0..1). */
function useChapterProgress(refs: RefObject<(HTMLElement | null)[]>) {
  const [state, setState] = useState({ chapter: 0, p: 0, past: false });
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const els = refs.current ?? [];
      const vh = window.innerHeight;
      const line = vh * 0.55;
      let chapter = 0;
      let p = 0;
      els.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top <= line) {
          chapter = i;
          p = clamp01((line - r.top) / Math.max(1, r.height));
        }
      });
      const last = els[els.length - 1];
      const past = last ? last.getBoundingClientRect().bottom < vh * 0.4 : false;
      p = Math.round(p * 500) / 500;
      setState((s) => (s.chapter === chapter && s.p === p && s.past === past ? s : { chapter, p, past }));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [refs]);
  return state;
}

export function Story({ primary }: { primary: { href: string; label: string } }) {
  const { topic, setTopic, pickCount } = useTopic();
  const { paused, reduced } = useMotion();
  const root = useRef<HTMLElement>(null);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { chapter, p, past } = useChapterProgress(refs);
  const inView = useInView(stageRef, "0px");

  // ── Hero clock: plays once per topic pick, only while the hero is the active chapter.
  const [heroDone, setHeroDone] = useState(false);
  const [clock, setClock] = useClock(inView && !paused && chapter === 0 && !heroDone);
  useEffect(() => {
    if (!heroDone && (clock >= HERO_END || chapter > 0)) setHeroDone(true);
  }, [clock, chapter, heroDone]);
  useEffect(() => {
    if (pickCount === 0) return;
    setClock(0);
    setHeroDone(false);
  }, [pickCount, setClock]);
  const heroT = reduced || heroDone ? HERO_END : Math.min(clock, HERO_END);

  // ── Lights down for the presentation chapters (theatre effect, page-wide).
  const lightsDown = chapter >= 2 && !past;
  useEffect(() => {
    const lp = root.current?.closest(".lp");
    if (lp) lp.setAttribute("data-lights", lightsDown ? "down" : "up");
  }, [lightsDown]);

  // ── Format: chapter decides, unless the visitor picked one in this chapter.
  const [pinned, setPinned] = useState<{ chapter: number; format: PresentationFormat } | null>(null);
  const format: PresentationFormat = pinned && pinned.chapter === chapter ? pinned.format : chapter === 3 ? "portrait" : "landscape";

  const m = useMemo(() => modelsFor(topic), [topic]);
  const mode = chapter <= 1 ? "canvas" : "stage";
  const stageModel = format === "portrait" ? m.portrait : m.landscape;
  const aspect = mode === "canvas" ? m.canvas.width / m.canvas.height : stageModel.width / stageModel.height;
  const size = useFitBox(bodyRef, aspect, mode === "canvas" ? 0 : 14);

  let svg: string;
  let sceneIndex = 0;
  if (chapter === 0) {
    svg = canvasSvg(m, drawingFrame(m, (heroT - TYPE_MS - THINK_MS) / DRAW_MS), "lpc");
  } else if (chapter === 1) {
    const ep = reduced ? (p >= E_APPLY ? 1 : 0) : (p - E_APPLY) / (E_SETTLE - E_APPLY);
    svg = canvasSvg(m, editFrame(m, ep), "lpc");
  } else {
    const r = presentFrame(stageModel, topic.scenes, p, { instant: reduced });
    sceneIndex = r.index;
    svg = stageSvg(stageModel, r.frame, "lps");
  }

  // ── Overlay state
  const heroStatus = heroT < TYPE_MS ? "typing" : heroT < TYPE_MS + THINK_MS ? "thinking" : heroT < HERO_END ? "drawing" : "done";
  const heroTyped = topic.prompt.slice(0, Math.round(clamp01(heroT / TYPE_MS) * topic.prompt.length));
  const editTyped = reduced ? topic.editPrompt : topic.editPrompt.slice(0, Math.round(clamp01(p / E_TYPE) * topic.editPrompt.length));
  const applied = p >= E_APPLY;
  const addedCount = topic.after.nodes.length - topic.before.nodes.length;

  function scrollToChapter(i: number, within = 0) {
    const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
    if (i === 0) return window.scrollTo({ top: 0, behavior });
    const el = refs.current[i];
    if (!el) return;
    const r = el.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top - window.innerHeight * 0.55 + r.height * within + 2, behavior });
  }

  const setRef = (i: number) => (el: HTMLElement | null) => {
    refs.current[i] = el;
  };

  return (
    <section ref={root} className="st" aria-label="How Diagram Studio works">
      {/* ── Hero copy ─────────────────────────────────────────────── */}
      <article ref={setRef(0)} className="st-hero" aria-labelledby="hero-title">
        <h1 id="hero-title">From one sentence to a diagram you can present.</h1>
        <p className="st-lede">
          Describe a system in plain words. Diagram Studio draws it as an editable Excalidraw diagram, then turns it into scenes for YouTube, courses and Shorts.
        </p>
        <div className="st-try">
          <p id="try-label" className="st-try-label">
            Pick one and watch it draw
          </p>
          <div className="st-chips" role="radiogroup" aria-labelledby="try-label">
            {TOPICS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={t.id === topic.id}
                className="st-chip"
                onClick={() => {
                  setTopic(t.id);
                  if (chapter !== 0) scrollToChapter(0);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="lp-cta-row">
          <Link href={primary.href} className="lp-btn lp-btn-ink">
            {primary.label}
          </Link>
          <button type="button" className="lp-btn lp-btn-line" onClick={() => scrollToChapter(1)}>
            See how it works
          </button>
        </div>
        <p className="lp-fineprint">Runs on your own Gemini key, or on models running on your computer with Ollama.</p>
      </article>

      {/* ── Pinned product window ─────────────────────────────────── */}
      <div className="st-stage" ref={stageRef}>
        <div className="st-win" data-mode={mode} data-format={format}>
          <div className="st-bar">
            <span className="st-file">
              <LogoMark className="st-file-logo" />
              <span className="st-file-name">{topic.after.title}</span>
              <span className="st-file-state">{chapter === 0 && heroStatus !== "done" ? "Drawing" : "Saved"}</span>
            </span>
            <nav className="st-rail" aria-label="Story chapters">
              {CHAPTERS.map((c, i) => (
                <button key={c.id} type="button" aria-current={chapter === i ? "step" : undefined} data-done={i < chapter || undefined} onClick={() => scrollToChapter(i)}>
                  {c.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="st-body">
            <div className="st-canvas" ref={bodyRef}>
              <div
                className="st-frame"
                role="img"
                aria-label={`Live demo: the ${topic.label} diagram, following the section you are reading.`}
                style={{ width: size.width || undefined, height: size.height || undefined }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              {mode === "stage" && (
                <div className="st-player">
                  <span className="st-pips" aria-hidden>
                    {topic.scenes.map((s, i) => (
                      <i key={s.id} data-on={i <= sceneIndex || undefined} />
                    ))}
                  </span>
                  <div className="st-formats" role="radiogroup" aria-label="Presentation format">
                    {(["landscape", "portrait"] as const).map((f) => (
                      <button key={f} type="button" role="radio" aria-checked={format === f} onClick={() => setPinned({ chapter, format: f })}>
                        {f === "landscape" ? "16:9" : "9:16"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* The editor's assistant panel: the prompt, then the requested change and its preview. */}
            <aside className="st-side" data-open={mode === "canvas" || undefined} data-chapter={chapter} aria-hidden>
              <p className="st-side-head">Assistant</p>
              <div className="st-msgs">
                <div className="st-turn st-turn-describe">
                  <p className="st-bubble">
                    {chapter === 0 ? heroTyped || <span className="st-placeholder">Describe what you want to explain…</span> : topic.prompt}
                    {chapter === 0 && heroStatus === "typing" && <span className="lp-caret" />}
                  </p>
                  <p className="st-status" data-status={chapter === 0 ? heroStatus : "done"}>
                    {chapter === 0 && heroStatus === "typing" && "Typing…"}
                    {chapter === 0 && heroStatus === "thinking" && "Writing the diagram…"}
                    {chapter === 0 && heroStatus === "drawing" && "Laying it out…"}
                    {(chapter !== 0 || heroStatus === "done") && `Drew ${topic.before.nodes.length} components and ${topic.before.edges.length} connections`}
                  </p>
                </div>
                {chapter === 1 && (
                  <div className="st-turn st-turn-edit">
                    <p className="st-bubble">
                      {editTyped}
                      {p < E_TYPE && !reduced && <span className="lp-caret" />}
                    </p>
                    <div className="st-diff" data-on={p >= E_DIFF || reduced || undefined} data-applied={applied || undefined}>
                      <p className="st-diff-head">{applied ? `Applied. ${addedCount} component${addedCount === 1 ? "" : "s"} added.` : "Preview of changes"}</p>
                      <ul>
                        {topic.diff.map((d, i) => (
                          <li key={d.text} data-kind={d.kind} data-on={reduced || p >= E_DIFF + 0.035 * (i + 1) || undefined}>
                            <span className="st-diff-sign">{d.kind === "add" ? "+" : "−"}</span>
                            {d.text}
                          </li>
                        ))}
                      </ul>
                      <div className="st-diff-actions">
                        {applied ? (
                          <span className="st-diff-btn">Undo</span>
                        ) : (
                          <>
                            <span className="st-diff-btn">Discard</span>
                            <span className="st-diff-btn st-diff-apply" data-pressed={p >= E_APPLY - 0.04 || undefined}>
                              Apply
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
        <p className="st-note" aria-hidden key={chapter}>
          {NOTES[chapter]}
        </p>
      </div>

      {/* ── Chapters (scroll distance paces the stage) ─────────────── */}
      <div className="st-chapters">
        <article ref={setRef(1)} id="how" className="st-ch st-ch-edit" aria-labelledby="edit-title">
          <div className="st-ch-inner">
            <h2 id="edit-title">Change it by asking.</h2>
            <p>
              Type what should be different, like “{topic.editPrompt.toLowerCase()}”. You see exactly what will change before anything moves, and the parts you arranged stay where you put them.
            </p>
            <ul className="st-facts">
              <li>Every AI change is a preview you apply or discard.</li>
              <li>Undo in one click. Each change is saved as a version.</li>
              <li>Or skip the AI and drag things around. It’s a real Excalidraw canvas.</li>
            </ul>
          </div>
        </article>

        <article ref={setRef(2)} id="present" className="st-ch st-ch-present" aria-labelledby="present-title">
          <div className="st-ch-inner">
            <h2 id="present-title">Then tell it one idea at a time.</h2>
            <p>Scenes decide what appears, what’s highlighted and where the camera looks. The AI drafts them from your diagram; you rewrite the narration in your own words.</p>
            <ol className="st-scenes" aria-label={`Scenes in the ${topic.label} presentation`}>
              {topic.scenes.map((s, i) => (
                <li key={s.id} aria-current={chapter === 2 && i === sceneIndex ? "step" : undefined}>
                  <button type="button" onClick={() => scrollToChapter(2, (i + 0.5) / topic.scenes.length)}>
                    {s.title}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </article>

        <article ref={setRef(3)} id="formats" className="st-ch st-ch-formats" aria-labelledby="formats-title">
          <div className="st-ch-inner">
            <h2 id="formats-title">16:9 for YouTube. 9:16 for Shorts.</h2>
            <p>Portrait gets its own vertical layout and camera, not a crop of the landscape version. Drag components to fine-tune either format, and your scenes stay in sync across both.</p>
            <p className="st-aside">Present full screen from the keyboard, or export both formats as video.</p>
          </div>
        </article>
      </div>
    </section>
  );
}
