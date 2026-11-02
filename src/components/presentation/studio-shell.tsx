"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, CloudOff, Move, Play, RectangleHorizontal, RectangleVertical, RotateCcw, Sparkles, TriangleAlert, Wand2, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { ExportMenu } from "@/components/editor/export-menu";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { DiagramDSL } from "@/features/diagrams/schema/dsl";
import type { Box } from "@/features/layout";
import {
  autoGenerateScenes,
  buildPresentationModel,
  DEFAULT_TRANSITION,
  effectiveFormatConfig,
  FORMAT_LABELS,
  interpolateFrame,
  moveNodeInFormat,
  newSceneId,
  reconcileScenes,
  regenerateFormatLayout,
  reorderScenes,
  resolvePositions,
  staticFrame,
  type FrameState,
  type NodeColor,
  type PresentationFormat,
  type PresentationFormats,
  type PresentationScene,
} from "@/features/presentations";
import { createClientAIProvider, describeAIError } from "@/features/ai/services/client-provider";
import type { AISettings } from "@/features/ai/services/settings";
import { exportProjectJson, exportSceneImages } from "@/features/exports/client";
import { SceneList } from "./scene-list";
import { SceneProperties } from "./scene-properties";
import { SceneStage } from "./scene-stage";
import { VideoExportDialog } from "./video-export-dialog";

export interface StudioProps {
  projectId: string;
  title: string;
  presentationId: string;
  diagram: DiagramDSL;
  excalidrawElements: unknown[];
  colors: Record<string, NodeColor>;
  editorBoxes: Record<string, Box>;
  initialScenes: PresentationScene[];
  initialFormats: PresentationFormats;
  initialFormat: PresentationFormat;
  aiSettings: AISettings;
}

type SaveState = "saved" | "saving" | "dirty" | "error";

export function StudioShell(props: StudioProps) {
  const search = useSearchParams();
  const { diagram } = props;
  const initial = useMemo(() => reconcileScenes(props.initialScenes, diagram), [props.initialScenes, diagram]);
  const [scenes, setScenes] = useState<PresentationScene[]>(initial.scenes);
  const [selectedId, setSelectedId] = useState<string | null>(initial.scenes[0]?.id ?? null);
  const [format, setFormat] = useState<PresentationFormat>(props.initialFormat);
  const [formats, setFormats] = useState<PresentationFormats>(props.initialFormats);
  const [layoutMode, setLayoutMode] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState<null | "ai" | "auto">(null);
  const [videoOpen, setVideoOpen] = useState(search.get("export") === "video");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [previewFrame, setPreviewFrame] = useState<FrameState | null>(null);
  const scenesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formatsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const formatsRef = useRef(formats);
  formatsRef.current = formats;

  useEffect(() => {
    if (initial.warnings.length) toast.message("Scenes were updated to match the diagram", { description: initial.warnings.slice(0, 3).join(" ") });
  }, [initial.warnings]);

  // ── Persistence (debounced) ──
  const flushScenes = useCallback(async () => {
    if (scenesTimer.current) clearTimeout(scenesTimer.current);
    scenesTimer.current = null;
    setSaveState("saving");
    try {
      await api.put(`/api/presentations/${props.presentationId}/scenes`, { scenes: scenesRef.current });
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      toast.error("Couldn’t save scenes", { description: errorMessage(err), action: { label: "Retry", onClick: () => void flushScenes() } });
      throw err;
    }
  }, [props.presentationId]);

  const flushFormats = useCallback(
    async (activeFormat?: PresentationFormat) => {
      if (formatsTimer.current) clearTimeout(formatsTimer.current);
      formatsTimer.current = null;
      try {
        await api.patch(`/api/presentations/${props.presentationId}`, {
          landscape_config: formatsRef.current.landscape,
          portrait_config: formatsRef.current.portrait,
          ...(activeFormat ? { active_format: activeFormat } : {}),
        });
      } catch (err) {
        toast.error("Couldn’t save layout", { description: errorMessage(err) });
      }
    },
    [props.presentationId],
  );

  const updateScenes = useCallback(
    (next: PresentationScene[] | ((s: PresentationScene[]) => PresentationScene[])) => {
      setScenes((cur) => {
        const v = typeof next === "function" ? next(cur) : next;
        return v.map((s, i) => ({ ...s, order: i }));
      });
      setSaveState("dirty");
      if (scenesTimer.current) clearTimeout(scenesTimer.current);
      scenesTimer.current = setTimeout(() => void flushScenes().catch(() => undefined), 800);
    },
    [flushScenes],
  );

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (saveState === "dirty" || saveState === "saving" || saveState === "error") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [saveState]);

  // ── Models ──
  const effective = useMemo(() => effectiveFormatConfig(diagram, format, formats[format], props.editorBoxes), [diagram, format, formats, props.editorBoxes]);
  const model = useMemo(() => buildPresentationModel(diagram, format, effective, { colors: props.colors, editorBoxes: props.editorBoxes }), [diagram, format, effective, props.colors, props.editorBoxes]);
  const index = scenes.findIndex((s) => s.id === selectedId);
  const scene = index >= 0 ? scenes[index] : null;
  const frame = useMemo(
    () => (layoutMode ? staticFrame(model, null) : staticFrame(model, scene, { index: Math.max(0, index), total: Math.max(1, scenes.length) })),
    [model, scene, index, scenes.length, layoutMode],
  );
  const nodeCenters = useMemo(() => Object.fromEntries(model.nodes.map((n) => [n.id, { x: n.box.x + n.box.width / 2, y: n.box.y + n.box.height / 2 }])), [model]);

  // ── Scene operations ──
  function addScene() {
    const prev = scene ?? scenes[scenes.length - 1];
    const s: PresentationScene = {
      id: newSceneId(),
      title: `Scene ${scenes.length + 1}`,
      order: scenes.length,
      visibleNodeIds: prev ? [...prev.visibleNodeIds] : diagram.nodes.map((n) => n.id),
      visibleEdgeIds: prev ? [...prev.visibleEdgeIds] : diagram.edges.map((e) => e.id),
      highlightedNodeIds: [],
      highlightedEdgeIds: [],
      dimmedNodeIds: [],
      durationMs: 5000,
      transition: DEFAULT_TRANSITION,
    };
    const at = index >= 0 ? index + 1 : scenes.length;
    updateScenes((cur) => [...cur.slice(0, at), s, ...cur.slice(at)]);
    setSelectedId(s.id);
  }
  function duplicateScene(id: string) {
    const i = scenes.findIndex((s) => s.id === id);
    if (i < 0) return;
    const copy = { ...structuredClone(scenes[i]), id: newSceneId(), title: `${scenes[i].title} (copy)`.slice(0, 120) };
    updateScenes((cur) => [...cur.slice(0, i + 1), copy, ...cur.slice(i + 1)]);
    setSelectedId(copy.id);
  }
  function deleteScene(id: string) {
    const i = scenes.findIndex((s) => s.id === id);
    const removed = scenes[i];
    updateScenes((cur) => cur.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(scenes[i + 1]?.id ?? scenes[i - 1]?.id ?? null);
    toast.message(`Deleted “${removed?.title}”`, {
      action: {
        label: "Undo",
        onClick: () => {
          updateScenes((cur) => [...cur.slice(0, i), removed, ...cur.slice(i)]);
          setSelectedId(removed.id);
        },
      },
    });
  }
  function patchScene(patch: Partial<PresentationScene>) {
    if (!scene) return;
    updateScenes((cur) => cur.map((s) => (s.id === scene.id ? { ...s, ...patch } : s)));
  }

  async function generate(kind: "ai" | "auto") {
    setConfirmReplace(null);
    if (kind === "auto") {
      const next = autoGenerateScenes(diagram);
      updateScenes(next);
      setSelectedId(next[0]?.id ?? null);
      toast.success(`Built ${next.length} scenes`);
      return;
    }
    setAiBusy(true);
    try {
      const ai = createClientAIProvider(props.aiSettings);
      const r = await ai.generateScenes(diagram);
      updateScenes(r.value);
      setSelectedId(r.value[0]?.id ?? null);
      toast.success(`Generated ${r.value.length} scenes`, r.warnings.length ? { description: `${r.warnings.length} invalid reference(s) were removed.` } : undefined);
    } catch (err) {
      const e = describeAIError(err);
      toast.error(e.title, {
        description: e.message,
        action: { label: "Build without AI", onClick: () => void generate("auto") },
      });
    } finally {
      setAiBusy(false);
    }
  }

  // ── Preview the transition into the selected scene ──
  const previewRaf = useRef(0);
  function previewTransition() {
    if (!scene) return;
    cancelAnimationFrame(previewRaf.current);
    const from = index > 0 ? scenes[index - 1] : null;
    const dur = Math.max(scene.transition.durationMs, 1);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      setPreviewFrame(interpolateFrame(model, from, scene, t, { index, total: scenes.length }));
      if (t < 1) previewRaf.current = requestAnimationFrame(step);
      else setTimeout(() => setPreviewFrame(null), 400);
    };
    previewRaf.current = requestAnimationFrame(step);
  }
  useEffect(() => () => cancelAnimationFrame(previewRaf.current), []);

  // ── Format layout ──
  function setActiveFormat(f: PresentationFormat) {
    setFormat(f);
    setPreviewFrame(null);
    void flushFormats(f);
  }
  function onNodeMoved(nodeId: string, box: Box) {
    const all = resolvePositions(diagram, format, effective, props.editorBoxes);
    setFormats((cur) => ({ ...cur, [format]: moveNodeInFormat(effective, nodeId, box, all) }));
    if (formatsTimer.current) clearTimeout(formatsTimer.current);
    formatsTimer.current = setTimeout(() => void flushFormats(), 600);
  }
  function resetLayout() {
    setFormats((cur) => ({ ...cur, [format]: regenerateFormatLayout(diagram, format, cur[format], props.editorBoxes, { discardManual: true }) }));
    if (formatsTimer.current) clearTimeout(formatsTimer.current);
    formatsTimer.current = setTimeout(() => void flushFormats(), 300);
    toast.success(`${FORMAT_LABELS[format]} layout reset`);
  }

  const manualCount = formats[format].manualNodeIds?.length ?? 0;
  const playHref = `/presentation/${props.presentationId}?format=${format}`;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-card-edge px-2">
        <Tooltip content="Back to editor">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={`/editor/${props.projectId}`} aria-label="Back to editor">
              <ArrowLeft />
            </Link>
          </Button>
        </Tooltip>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{props.title}</p>
        </div>
        <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
          {saveState === "saving" && (
            <>
              <Spinner className="size-3" /> Saving…
            </>
          )}
          {saveState === "saved" && (
            <>
              <Check className="size-3.5 text-success" /> Saved
            </>
          )}
          {saveState === "dirty" && "Unsaved"}
          {saveState === "error" && (
            <button className="flex items-center gap-1 text-destructive" onClick={() => void flushScenes().catch(() => undefined)}>
              <CloudOff className="size-3.5" /> Retry save
            </button>
          )}
        </span>

        <div className="mx-auto flex items-center rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Presentation format">
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
              onClick={() => setActiveFormat(o.f)}
              className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium", format === o.f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <o.icon className="size-3.5" /> {o.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => (scenes.length ? setConfirmReplace("ai") : void generate("ai"))} disabled={aiBusy || !diagram.nodes.length}>
            {aiBusy ? <Spinner /> : <Sparkles />} <span className="hidden md:inline">Generate with AI</span>
          </Button>
          <Tooltip content="Build step-by-step scenes from the diagram's flow (no AI)">
            <Button size="sm" variant="ghost" onClick={() => (scenes.length ? setConfirmReplace("auto") : void generate("auto"))} disabled={!diagram.nodes.length} aria-label="Auto-build scenes">
              <Wand2 /> <span className="hidden lg:inline">Auto-build</span>
            </Button>
          </Tooltip>
          <ExportMenu
            compact
            disabled={!scenes.length}
            actions={{
              sceneImages: async () => {
                const t = toast.loading("Rendering scene images…");
                try {
                  await exportSceneImages({ title: props.title, diagram, scenes, format, config: formats[format], colors: props.colors, editorBoxes: props.editorBoxes }, (d, n) =>
                    toast.loading(`Rendering scene ${d} of ${n}…`, { id: t }),
                  );
                  toast.success("Scene images downloaded", { id: t });
                } catch (err) {
                  toast.error("Export failed", { id: t, description: errorMessage(err) });
                }
              },
              video: () => setVideoOpen(true),
              json: () => exportProjectJson({ title: props.title, diagram, excalidraw: { elements: props.excalidrawElements }, presentation: { formats, activeFormat: format }, scenes }),
            }}
          />
          <Button size="sm" variant="solid" asChild className={cn(!scenes.length && "pointer-events-none opacity-50")}>
            <Link
              href={playHref}
              onClick={async (e) => {
                if (saveState !== "saved") {
                  e.preventDefault();
                  try {
                    await flushScenes();
                    window.location.href = playHref;
                  } catch {
                    /* toast shown */
                  }
                }
              }}
            >
              <Play /> Play
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="h-48 shrink-0 border-b bg-sidebar md:h-auto md:w-64 md:border-r md:border-b-0">
          <SceneList
            scenes={scenes}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setLayoutMode(false);
              setPreviewFrame(null);
            }}
            onReorder={(from, to) => updateScenes((cur) => reorderScenes(cur, from, to))}
            onDuplicate={duplicateScene}
            onDelete={deleteScene}
            onAdd={addScene}
          />
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[radial-gradient(circle_at_center,_var(--muted)_0%,_var(--background)_70%)]">
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            <Button size="sm" variant={layoutMode ? "default" : "outline"} onClick={() => setLayoutMode((m) => !m)} disabled={diagram.type === "sequence"} title={diagram.type === "sequence" ? "Sequence diagrams use a fixed layout" : undefined}>
              <Move /> {layoutMode ? "Done adjusting" : `Adjust ${format === "portrait" ? "9:16" : "16:9"} layout`}
            </Button>
            {layoutMode && manualCount > 0 && (
              <Button size="sm" variant="ghost" onClick={resetLayout}>
                <RotateCcw /> Reset {manualCount} moved
              </Button>
            )}
            {!layoutMode && scene && (
              <Button size="sm" variant="ghost" onClick={previewTransition}>
                <Eye /> Preview transition
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {layoutMode ? "Drag components to position them for this format only." : `${FORMAT_LABELS[format]} · ${model.width}×${model.height}`}
            </span>
          </div>
          <div className="min-h-0 flex-1 p-4">
            {!diagram.nodes.length ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <TriangleAlert className="size-5" /> The diagram is empty.
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/editor/${props.projectId}`}>Back to the editor</Link>
                </Button>
              </div>
            ) : !scenes.length && !layoutMode ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div>
                  <p className="font-medium">Turn this diagram into a presentation</p>
                  <p className="mt-1 text-sm text-muted-foreground">Scenes reveal components and connections step by step.</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => void generate("ai")} disabled={aiBusy}>
                    {aiBusy ? <Spinner /> : <Sparkles />} Generate scenes with AI
                  </Button>
                  <Button variant="outline" onClick={() => void generate("auto")}>
                    <Wand2 /> Build step by step (no AI)
                  </Button>
                </div>
              </div>
            ) : (
              <SceneStage model={model} frame={previewFrame ?? frame} editable={layoutMode} onNodeMoved={onNodeMoved} showCaption={!layoutMode} />
            )}
          </div>
        </section>

        {scene && !layoutMode && (
          <aside className="max-h-[45vh] shrink-0 overflow-y-auto border-t bg-sidebar scroll-thin md:max-h-none md:w-80 md:border-t-0 md:border-l">
            <SceneProperties key={scene.id} scene={scene} previous={index > 0 ? scenes[index - 1] : undefined} diagram={diagram} format={format} nodeCenters={nodeCenters} onChange={patchScene} />
          </aside>
        )}
      </div>

      <AlertDialog open={confirmReplace !== null} onOpenChange={(o) => !o && setConfirmReplace(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your {scenes.length} scenes?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmReplace === "ai" ? "AI will design a new set of scenes from the diagram." : "Scenes will be rebuilt step by step from the diagram's flow."} Your current scenes will be replaced.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmReplace && void generate(confirmReplace)}>Replace scenes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VideoExportDialog
        open={videoOpen}
        onOpenChange={setVideoOpen}
        presentationId={props.presentationId}
        defaultFormat={format}
        beforeQueue={async () => {
          if (saveState !== "saved") await flushScenes();
          await flushFormats(format);
        }}
      />
    </div>
  );
}
