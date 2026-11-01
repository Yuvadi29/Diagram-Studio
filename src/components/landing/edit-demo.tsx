"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildPresentationModel, DEFAULT_FORMATS, effectiveFormatConfig, interpolateFrame, renderFrameSvg, type PresentationModel, type PresentationScene } from "@/features/presentations";
import { useFitBox } from "@/components/presentation/use-fit-box";
import { EDIT_DEMO } from "./demo-data";

const BEFORE: PresentationScene = {
  id: "before",
  title: "",
  order: 0,
  visibleNodeIds: ["browser", "gateway", "service", "db"],
  visibleEdgeIds: ["a", "b", "old"],
  cameraByFormat: { landscape: { mode: "all" } },
  durationMs: 1000,
  transition: { type: "zoom", durationMs: 900 },
};
const AFTER: PresentationScene = {
  ...BEFORE,
  id: "after",
  visibleNodeIds: ["browser", "gateway", "service", "redis", "db"],
  visibleEdgeIds: ["a", "b", "c", "d"],
  highlightedNodeIds: ["redis"],
  highlightedEdgeIds: ["c", "d"],
};

function model(narrow: boolean): PresentationModel {
  const diagram = narrow ? { ...EDIT_DEMO, layout: "top-to-bottom" as const } : EDIT_DEMO;
  const cfg = narrow
    ? { ...DEFAULT_FORMATS.portrait, width: 1080, height: 1440, layout: "vertical" as const, backgroundColor: "transparent", padding: 50 }
    : { ...DEFAULT_FORMATS.landscape, backgroundColor: "transparent", padding: 50 };
  const m = buildPresentationModel(diagram, "landscape", effectiveFormatConfig(diagram, "landscape", cfg), { theme: "light" });
  return { ...m, stage: { x: 50, y: 50, width: m.width - 100, height: m.height - 100 } };
}

function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

/** "Ask for changes" demo: user-triggered Apply / Undo with the real renderer. */
export function EditDemo() {
  const narrow = useNarrow();
  const m = useMemo(() => model(narrow), [narrow]);
  const area = useRef<HTMLDivElement>(null);
  const size = useFitBox(area, m.width / m.height, 0);
  const [applied, setApplied] = useState(false);
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }
    setProgress(0);
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [applied]);

  const frame = applied ? interpolateFrame(m, BEFORE, AFTER, progress, { index: 0, total: 1 }) : interpolateFrame(m, AFTER, { ...BEFORE, transition: { type: "fade", durationMs: 500 } }, progress, { index: 0, total: 1 });
  const svg = renderFrameSvg(m, frame, { responsive: true, sketch: true, showCaption: false, showProgress: false, idPrefix: "edit" });

  return (
    <div className="lp-edit">
      <div className="lp-chat" aria-live="polite">
        <p className="lp-chat-user">Add Redis between the service and the database</p>
        <div className="lp-chat-card">
          <p className="lp-chat-title">Add a Redis cache in front of PostgreSQL</p>
          <ul className="lp-diff">
            <li data-kind="add">Redis</li>
            <li data-kind="remove">Orders service → PostgreSQL</li>
            <li data-kind="add">Orders service → Redis: Cache lookup</li>
            <li data-kind="add">Redis → PostgreSQL: On miss</li>
          </ul>
          <p className="lp-chat-meta">Everything else stays where you put it.</p>
          <div className="lp-chat-actions">
            {applied ? (
              <>
                <span className="lp-applied">Applied</span>
                <button type="button" className="lp-btn lp-btn-quiet" onClick={() => setApplied(false)}>
                  Undo
                </button>
              </>
            ) : (
              <button type="button" className="lp-btn lp-btn-ink" onClick={() => setApplied(true)}>
                Apply change
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="lp-edit-canvas" ref={area} role="img" aria-label={applied ? "Diagram with a Redis cache added between the orders service and PostgreSQL." : "Diagram: browser, API gateway, orders service and PostgreSQL."}>
        <div style={{ width: size.width, height: size.height }} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </div>
  );
}
