"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Maximize, Minimize, Pause, Play, RectangleHorizontal, RectangleVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import type { DiagramDSL } from "@/features/diagrams/schema/dsl";
import type { Box } from "@/features/layout";
import {
  buildPresentationModel,
  effectiveFormatConfig,
  interpolateFrame,
  renderFrameSvg,
  sortScenes,
  type NodeColor,
  type PresentationFormat,
  type PresentationFormats,
  type PresentationScene,
} from "@/features/presentations";
import { useFitBox } from "./use-fit-box";

export interface PlayerProps {
  title: string;
  diagram: DiagramDSL;
  scenes: PresentationScene[];
  formats: PresentationFormats;
  initialFormat: PresentationFormat;
  colors?: Record<string, NodeColor>;
  editorBoxes?: Record<string, Box>;
  exitHref?: string;
  autoplay?: boolean;
}

/**
 * Dedicated presentation viewer. Independent of the Excalidraw editor: it
 * renders the shared presentation model with the pure SVG renderer.
 */
export function Player(props: PlayerProps) {
  const scenes = useMemo(() => sortScenes(props.scenes), [props.scenes]);
  const [format, setFormat] = useState<PresentationFormat>(props.initialFormat);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(Boolean(props.autoplay));
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  const models = useMemo(() => {
    const build = (f: PresentationFormat) =>
      buildPresentationModel(props.diagram, f, effectiveFormatConfig(props.diagram, f, props.formats[f], props.editorBoxes), { colors: props.colors, editorBoxes: props.editorBoxes });
    return { landscape: build("landscape"), portrait: build("portrait") };
  }, [props.diagram, props.formats, props.colors, props.editorBoxes]);
  const model = models[format];

  const rootRef = useRef<HTMLDivElement>(null);
  const stageOuter = useRef<HTMLDivElement>(null);
  const svgHost = useRef<HTMLDivElement>(null);
  const size = useFitBox(stageOuter, model.width / model.height, 0);

  // Timing state lives in refs; the rAF loop writes SVG directly for smooth playback.
  const timing = useRef({ from: null as PresentationScene | null, sceneStart: performance.now(), pausedAt: null as number | null });

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(scenes.length - 1, next));
      setIndex((cur) => {
        timing.current.from = clamped === cur ? null : scenes[cur] ?? null;
        return clamped;
      });
      timing.current.sceneStart = performance.now();
      timing.current.pausedAt = null;
    },
    [scenes],
  );

  // Render loop
  useEffect(() => {
    let raf = 0;
    let lastProgressUpdate = 0;
    const loop = (now: number) => {
      const scene = scenes[index];
      if (scene && svgHost.current) {
        const t = timing.current;
        const elapsed = (t.pausedAt ?? now) - t.sceneStart;
        const tt = scene.transition.type === "none" || scene.transition.durationMs === 0 ? 1 : Math.min(1, elapsed / scene.transition.durationMs);
        const frame = interpolateFrame(model, t.from, scene, tt, { index, total: scenes.length });
        svgHost.current.innerHTML = renderFrameSvg(model, frame, { responsive: true, showProgress: false });
        if (now - lastProgressUpdate > 100) {
          setProgress(Math.min(1, elapsed / scene.durationMs));
          lastProgressUpdate = now;
        }
        if (playing && t.pausedAt === null && elapsed >= scene.durationMs) {
          if (index < scenes.length - 1) goTo(index + 1);
          else setPlaying(false);
        }
        if (tt < 1 || playing) {
          raf = requestAnimationFrame(loop);
          return;
        }
      }
      // Idle: one final frame drawn, stop looping until something changes.
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [index, playing, model, scenes, goTo, size.width]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      const t = timing.current;
      if (p) {
        t.pausedAt = performance.now();
      } else {
        if (t.pausedAt !== null) {
          t.sceneStart += performance.now() - t.pausedAt;
          t.pausedAt = null;
        }
        if (index === scenes.length - 1 && performance.now() - t.sceneStart >= scenes[index].durationMs) goTo(0);
      }
      return !p;
    });
  }, [index, scenes, goTo]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) void rootRef.current?.requestFullscreen?.().catch(() => undefined);
    else void document.exitFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
        case "Enter":
          e.preventDefault();
          goTo(index + 1);
          break;
        case "ArrowLeft":
        case "PageUp":
        case "Backspace":
          e.preventDefault();
          goTo(index - 1);
          break;
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "Home":
          goTo(0);
          break;
        case "End":
          goTo(scenes.length - 1);
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "o":
        case "O":
          setFormat((f) => (f === "landscape" ? "portrait" : "landscape"));
          break;
      }
      setControlsVisible(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, scenes.length, goTo, togglePlay, toggleFullscreen]);

  // Auto-hide controls while playing
  useEffect(() => {
    if (!controlsVisible || !playing) return;
    const t = setTimeout(() => setControlsVisible(false), 2500);
    return () => clearTimeout(t);
  }, [controlsVisible, playing]);

  const scene = scenes[index];

  return (
    <div
      ref={rootRef}
      className={cn("relative flex h-dvh flex-col bg-black text-white", !controlsVisible && "cursor-none")}
      onMouseMove={() => setControlsVisible(true)}
      onTouchStart={() => setControlsVisible(true)}
    >
      <div
        ref={stageOuter}
        className="flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button,a")) return;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          if (e.clientX - rect.left < rect.width * 0.3) goTo(index - 1);
          else goTo(index + 1);
        }}
      >
        <div ref={svgHost} style={{ width: size.width, height: size.height }} className="overflow-hidden rounded-md" role="img" aria-label={scene ? `${scene.title}. ${scene.description ?? ""}` : props.title} />
      </div>

      <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pt-10 pb-4 transition-opacity duration-300", controlsVisible ? "opacity-100" : "pointer-events-none opacity-0")}>
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          <div className="flex gap-1" role="tablist" aria-label="Scenes">
            {scenes.map((s, i) => (
              <button key={s.id} role="tab" aria-selected={i === index} aria-label={`Scene ${i + 1}: ${s.title}`} onClick={() => goTo(i)} className="group h-4 flex-1 py-1.5">
                <span className="block h-1 overflow-hidden rounded-full bg-white/20 group-hover:bg-white/35">
                  <span className="block h-full rounded-full bg-[#f5b43a]" style={{ width: i < index ? "100%" : i === index ? `${(playing || progress >= 1 ? progress : 1) * 100}%` : "0%" }} />
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous scene">
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause /> : <Play />}
            </Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={() => goTo(index + 1)} disabled={index === scenes.length - 1} aria-label="Next scene">
              <ChevronRight />
            </Button>
            <span className="ml-1 min-w-0 truncate text-sm text-white/80">
              <span className="font-mono text-white/60">
                {index + 1}/{scenes.length}
              </span>{" "}
              {scene?.title}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <div className="mr-1 hidden items-center rounded-md bg-white/10 p-0.5 sm:flex" role="radiogroup" aria-label="Format">
                {(
                  [
                    { f: "landscape", icon: RectangleHorizontal, label: "16:9" },
                    { f: "portrait", icon: RectangleVertical, label: "9:16" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.f}
                    role="radio"
                    aria-checked={format === o.f}
                    onClick={() => setFormat(o.f)}
                    className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs", format === o.f ? "bg-white/20 text-white" : "text-white/60 hover:text-white")}
                  >
                    <o.icon className="size-3.5" /> {o.label}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white sm:hidden" onClick={() => setFormat((f) => (f === "landscape" ? "portrait" : "landscape"))} aria-label="Switch format">
                {format === "landscape" ? <RectangleVertical /> : <RectangleHorizontal />}
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>
                {fullscreen ? <Minimize /> : <Maximize />}
              </Button>
              {props.exitHref && (
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" asChild>
                  <Link href={props.exitHref} aria-label="Exit presentation">
                    <X />
                  </Link>
                </Button>
              )}
            </div>
          </div>
          <p className="hidden items-center gap-3 text-[11px] text-white/40 lg:flex">
            <span>
              <Kbd>←</Kbd> <Kbd>→</Kbd> navigate
            </span>
            <span>
              <Kbd>Space</Kbd> play/pause
            </span>
            <span>
              <Kbd>F</Kbd> full screen
            </span>
            <span>
              <Kbd>O</Kbd> switch 16:9 / 9:16
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
