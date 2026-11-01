"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CloudOff, History, PanelLeft, PanelRight, Play, Redo2, Settings2, Undo2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { AssistantPanel, type UndoHandle } from "@/components/ai/assistant-panel";
import { ProviderSettingsForm, type CloudStatus } from "@/components/ai/provider-settings";
import { useTheme } from "@/components/shared/theme-toggle";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { downloadBlob, relativeTime, safeFilename } from "@/lib/utils/format";
import type { DiagramRow, ExcalidrawData } from "@/lib/supabase/types";
import { DIAGRAM_TYPE_LABELS, DIAGRAM_TYPES, type DiagramDSL, type DiagramEdge, type DiagramNode, type DiagramType } from "@/features/diagrams/schema/dsl";
import { applyPatch } from "@/features/diagrams/services/patch";
import { PENDING_PROMPT_KEY } from "@/features/diagrams/services/examples";
import { fromExcalidrawScene, getNodeBoxes, getNodeStyles, type ExElement } from "@/features/excalidraw/adapter";
import {
  applyDiagramToCanvas,
  exportExcalidrawFile,
  exportPng,
  exportSvg,
  getElements,
  makeThumbnail,
  sceneVersion,
  selectElements,
  setSceneElements,
  triggerHistory,
} from "@/features/excalidraw/services/editor-bridge";
import { createClientAIProvider } from "@/features/ai/services/client-provider";
import type { AISettings } from "@/features/ai/services/settings";
import { exportProjectJson, exportSceneImages } from "@/features/exports/client";
import type { PresentationScene } from "@/features/presentations";
import type { PresentationRow } from "@/lib/supabase/types";
import { InspectorPanel } from "./inspector-panel";
import { OutlinePanel } from "./outline-panel";
import { VersionsDialog } from "./versions-dialog";
import { ExportMenu } from "./export-menu";

const ExcalidrawCanvas = dynamic(() => import("./excalidraw-canvas"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
      <Spinner className="mr-2" /> Loading canvas…
    </div>
  ),
});

type SaveState = "saved" | "dirty" | "saving" | "error";
const DRAFT_KEY = (id: string) => `ds-draft:${id}`;

export interface EditorShellProps {
  projectId: string;
  projectTitle: string;
  diagram: DiagramRow;
  presentation: PresentationRow;
  initialSettings: AISettings;
  cloud: CloudStatus;
}

export function EditorShell(props: EditorShellProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const diagramId = props.diagram.id;
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [apiReady, setApiReady] = useState(false);

  const [title, setTitle] = useState(props.projectTitle);
  const [dsl, setDsl] = useState<DiagramDSL>(props.diagram.diagram_dsl);
  const dslRef = useRef(dsl);
  dslRef.current = dsl;
  const titleRef = useRef(title);
  titleRef.current = title;

  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<string>(props.diagram.updated_at);
  const savedVersionRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef(0);
  const dirtySinceVersionRef = useRef(false);
  const lastThumbRef = useRef(0);
  const baseUpdatedAtRef = useRef(props.diagram.updated_at);
  const deriveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const selectionKey = useRef("");
  const [settings, setSettings] = useState<AISettings>(props.initialSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightTab, setRightTab] = useState("assistant");
  const [sceneCount, setSceneCount] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ savedAt: string; excalidraw: ExcalidrawData; dsl: DiagramDSL } | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<{ prompt: string; type: DiagramType | "auto" } | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState<{ text: string; nonce: number } | null>(null);
  const undoStack = useRef(new Map<string, { elements: unknown[]; dsl: DiagramDSL }>());

  const studioHref = `/editor/${props.projectId}/present`;

  // ── Mount: pending prompt, local draft recovery, scene count, responsive panels ──
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_PROMPT_KEY(props.projectId));
      if (raw) setPendingPrompt(JSON.parse(raw));
      const d = localStorage.getItem(DRAFT_KEY(diagramId));
      if (d) {
        const parsed = JSON.parse(d);
        if (new Date(parsed.savedAt).getTime() > new Date(props.diagram.updated_at).getTime()) setDraft(parsed);
        else localStorage.removeItem(DRAFT_KEY(diagramId));
      }
    } catch {
      /* ignore */
    }
    if (window.innerWidth < 1024) setLeftOpen(false);
    if (window.innerWidth < 768) setRightOpen(false);
    api
      .get<{ scenes: PresentationScene[] }>(`/api/presentations/${props.presentation.id}/scenes`)
      .then((r) => setSceneCount(r.scenes.length))
      .catch(() => setSceneCount(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Saving ──
  const collect = useCallback(() => {
    const a = apiRef.current!;
    const elements = getElements(a);
    const appState = a.getAppState();
    const derived = fromExcalidrawScene({ elements }, dslRef.current);
    return {
      elements,
      dsl: { ...derived, title: dslRef.current.title, description: dslRef.current.description },
      excalidraw: { elements: elements as unknown[], appState: { viewBackgroundColor: appState.viewBackgroundColor, gridSize: appState.gridSize }, files: a.getFiles() as Record<string, unknown> },
      version: sceneVersion(a.getSceneElementsIncludingDeleted()),
    };
  }, []);

  const save = useCallback(
    async (opts: { createVersion?: string; force?: boolean } = {}): Promise<boolean> => {
      if (!apiRef.current) return false;
      if (savingRef.current) {
        pendingSaveRef.current = true;
        return false;
      }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      savingRef.current = true;
      setSaveState("saving");
      const snap = collect();
      let thumbnail: string | null | undefined;
      if (opts.createVersion || Date.now() - lastThumbRef.current > 15_000) {
        thumbnail = await makeThumbnail(apiRef.current).catch(() => undefined);
        lastThumbRef.current = Date.now();
      }
      try {
        const r = await api.put<{ updatedAt: string; version: number }>(`/api/diagrams/${diagramId}`, {
          title: titleRef.current,
          dsl: snap.dsl,
          excalidraw: snap.excalidraw,
          thumbnail,
          createVersion: opts.createVersion ? { description: opts.createVersion } : undefined,
          baseUpdatedAt: opts.force ? undefined : baseUpdatedAtRef.current,
        });
        baseUpdatedAtRef.current = r.updatedAt;
        savedVersionRef.current = snap.version;
        setLastSavedAt(r.updatedAt);
        retryRef.current = 0;
        if (opts.createVersion) dirtySinceVersionRef.current = false;
        try {
          localStorage.removeItem(DRAFT_KEY(diagramId));
        } catch {
          /* ignore */
        }
        const nowVersion = apiRef.current ? sceneVersion(apiRef.current.getSceneElementsIncludingDeleted()) : snap.version;
        setSaveState(nowVersion === snap.version ? "saved" : "dirty");
        return true;
      } catch (err) {
        setSaveState("error");
        try {
          localStorage.setItem(DRAFT_KEY(diagramId), JSON.stringify({ savedAt: new Date().toISOString(), excalidraw: snap.excalidraw, dsl: snap.dsl }));
        } catch {
          /* quota */
        }
        if (err instanceof ApiClientError && err.code === "STALE_WRITE") {
          toast.error("This diagram changed elsewhere", {
            description: err.message,
            action: { label: "Overwrite", onClick: () => void save({ ...opts, force: true }) },
          });
        } else if (retryRef.current < 3 && !(err instanceof ApiClientError && err.status >= 400 && err.status < 500)) {
          const delay = [2000, 5000, 15000][retryRef.current++];
          saveTimer.current = setTimeout(() => void save(opts), delay);
        } else {
          toast.error("Couldn’t save your changes", { description: `${errorMessage(err)} Your work is kept locally in this browser.` });
        }
        return false;
      } finally {
        savingRef.current = false;
        if (pendingSaveRef.current) {
          pendingSaveRef.current = false;
          void save();
        }
      }
    },
    [collect, diagramId],
  );

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), 1500);
  }, [save]);

  // ── Canvas change handler: dirty tracking, live outline, selection ──
  const onCanvasChange = useCallback(
    (elements: readonly unknown[], appState: { selectedElementIds?: Record<string, boolean> }) => {
      const els = elements as readonly ExElement[];
      const v = sceneVersion(els);
      if (savedVersionRef.current === null) savedVersionRef.current = v;
      else if (v !== savedVersionRef.current) {
        dirtySinceVersionRef.current = true;
        setSaveState((s) => (s === "saving" ? s : "dirty"));
        scheduleSave();
        if (deriveTimer.current) clearTimeout(deriveTimer.current);
        deriveTimer.current = setTimeout(() => {
          const live = els.filter((e) => !e.isDeleted);
          const next = fromExcalidrawScene({ elements: live }, dslRef.current);
          const merged = { ...next, title: dslRef.current.title, description: dslRef.current.description };
          if (JSON.stringify(merged) !== JSON.stringify(dslRef.current)) setDsl(merged);
        }, 350);
      }
      const sel = Object.keys(appState.selectedElementIds ?? {}).filter((k) => appState.selectedElementIds![k]);
      const key = sel.sort().join(",");
      if (key !== selectionKey.current) {
        selectionKey.current = key;
        const byId = new Map(els.map((e) => [e.id, e]));
        const nodes = new Set<string>();
        const edges = new Set<string>();
        for (const id of sel) {
          const el = byId.get(id);
          if (!el) continue;
          const cd = el.customData as { dsKind?: string; dsId?: string } | undefined;
          if (cd?.dsKind === "node" || cd?.dsKind === "node-label") nodes.add(cd.dsId!);
          else if (cd?.dsKind === "edge" || cd?.dsKind === "edge-label") edges.add(cd.dsId!);
          else if (el.type === "arrow") edges.add(el.id);
          else if (["rectangle", "ellipse", "diamond"].includes(el.type)) nodes.add(el.id);
        }
        setSelectedNodeIds([...nodes]);
        setSelectedEdgeIds([...edges]);
      }
    },
    [scheduleSave],
  );

  // ── Leave protection + Cmd/Ctrl+S ──
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (saveState !== "saved") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const keydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
        void save();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", keydown, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("keydown", keydown, true);
    };
  }, [saveState, save]);

  // ── Applying structural changes to the canvas ──
  const snapshot = () => ({ elements: JSON.parse(JSON.stringify(getElements(apiRef.current!))) as unknown[], dsl: dslRef.current });
  const remember = (snap: { elements: unknown[]; dsl: DiagramDSL }): UndoHandle => {
    const id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    undoStack.current.set(id, snap);
    return { id };
  };

  const applyDiagram = useCallback(
    async (next: DiagramDSL, opts: { relayout?: boolean; versionDescription?: string } = {}) => {
      const a = apiRef.current;
      if (!a) throw new Error("The canvas is still loading.");
      if (opts.versionDescription && dirtySinceVersionRef.current && dslRef.current.nodes.length) {
        await save({ createVersion: "Manual edits" });
      }
      await applyDiagramToCanvas(a, next, { relayout: opts.relayout });
      setDsl(next);
      dslRef.current = next;
      if (opts.versionDescription) await save({ createVersion: opts.versionDescription });
      else scheduleSave();
    },
    [save, scheduleSave],
  );

  const ai = useMemo(() => createClientAIProvider(settings), [settings]);
  const aiFor = (override?: AISettings["provider"]) => (override && override !== settings.provider ? createClientAIProvider({ ...settings, provider: override }) : ai);

  const assistant = {
    generate: async (prompt: string, type: DiagramType | "auto", signal: AbortSignal, override?: AISettings["provider"]) => {
      const before = snapshot();
      const r = await aiFor(override).generateDiagram(prompt, { diagramId, diagramType: type, signal });
      const next: DiagramDSL = { ...r.value, id: diagramId, version: dslRef.current.version };
      // Generating from scratch replaces the canvas content managed by the DSL; user doodles are kept.
      if (dslRef.current.nodes.length && apiRef.current) {
        const keep = getElements(apiRef.current).filter((e) => !(e.customData as { dsKind?: string } | undefined)?.dsKind);
        await setSceneElements(apiRef.current, keep);
      }
      if (title === "Untitled diagram" || !title.trim()) setTitle(next.title);
      await applyDiagram(next, { relayout: true, versionDescription: `AI: generated “${next.title}”` });
      return {
        summary: `Created “${next.title}” with ${next.nodes.length} components and ${next.edges.length} connections.`,
        warnings: r.warnings,
        undo: remember(before),
      };
    },
    refine: async (instruction: string, history: { role: "user" | "assistant"; content: string }[], signal: AbortSignal, override?: AISettings["provider"]) => {
      const current = { ...collect().dsl, title: dslRef.current.title };
      const r = await aiFor(override).refineDiagram(current, instruction, { selectedNodeIds, history, signal });
      return { result: r.value, warnings: r.warnings };
    },
    applyPatch: async (next: DiagramDSL, summary: string, layoutChanged: boolean) => {
      const before = snapshot();
      await applyDiagram(next, { relayout: layoutChanged, versionDescription: `AI: ${summary}`.slice(0, 480) });
      return remember(before);
    },
    undo: async (handle: UndoHandle, summary: string) => {
      const snap = undoStack.current.get(handle.id);
      if (!snap || !apiRef.current) return;
      await setSceneElements(apiRef.current, snap.elements);
      setDsl(snap.dsl);
      dslRef.current = snap.dsl;
      await save({ createVersion: `Undid: ${summary}`.slice(0, 480) });
      toast.success("Change undone");
    },
  };

  async function changeProvider(provider: AISettings["provider"]) {
    const next = { ...settings, provider };
    setSettings(next);
    api.patch("/api/profile", { preferences: { provider } }).catch(() => undefined);
    toast.message(`Using ${provider === "ollama" ? "local Ollama" : "cloud AI"}`);
  }

  // ── Inspector edits go through the patch pipeline (validated, position-preserving) ──
  async function updateNode(id: string, patch: Partial<DiagramNode>) {
    try {
      const changes: Record<string, unknown> = {};
      if (patch.label !== undefined) changes.label = patch.label;
      if (patch.type !== undefined) changes.type = patch.type;
      if ("description" in patch) changes.description = patch.description ?? "";
      if ("groupId" in patch) changes.groupId = patch.groupId ?? null;
      if ("style" in patch) changes.highlight = Boolean(patch.style?.highlight);
      const { diagram } = applyPatch(collect().dsl, [{ op: "update_node", id, changes }]);
      await applyDiagram({ ...diagram, version: dslRef.current.version });
    } catch (err) {
      toast.error("Could not update component", { description: errorMessage(err) });
    }
  }
  async function updateEdge(id: string, patch: Partial<DiagramEdge>) {
    try {
      const changes: Record<string, unknown> = {};
      if ("label" in patch) changes.label = patch.label ?? "";
      if ("type" in patch) changes.type = patch.type ?? "default";
      const { diagram } = applyPatch(collect().dsl, [{ op: "update_edge", id, changes }]);
      await applyDiagram({ ...diagram, version: dslRef.current.version });
    } catch (err) {
      toast.error("Could not update connection", { description: errorMessage(err) });
    }
  }
  async function updateDiagram(patch: Partial<Pick<DiagramDSL, "title" | "description" | "type" | "layout">>, relayout = false) {
    const next = { ...collect().dsl, ...patch, title: dslRef.current.title };
    await applyDiagram(next, { relayout, versionDescription: relayout ? (patch.layout ? `Changed layout to ${patch.layout}` : `Changed type to ${patch.type}`) : undefined });
  }

  function selectNode(id: string) {
    if (!apiRef.current) return;
    const els = getElements(apiRef.current);
    const el = els.find((e) => (e.customData as { dsKind?: string; dsId?: string } | undefined)?.dsKind === "node" && (e.customData as { dsId?: string }).dsId === id) ?? els.find((e) => e.id === id);
    if (el) selectElements(apiRef.current, [el.id]);
  }
  function selectEdge(id: string) {
    if (!apiRef.current) return;
    const els = getElements(apiRef.current);
    const el = els.find((e) => (e.customData as { dsKind?: string; dsId?: string } | undefined)?.dsKind === "edge" && (e.customData as { dsId?: string }).dsId === id) ?? els.find((e) => e.id === id);
    if (el) selectElements(apiRef.current, [el.id]);
  }

  async function restoreFromRow(row: DiagramRow) {
    if (!apiRef.current) return;
    await setSceneElements(apiRef.current, row.excalidraw_data.elements ?? []);
    setDsl(row.diagram_dsl);
    dslRef.current = row.diagram_dsl;
    baseUpdatedAtRef.current = row.updated_at;
    savedVersionRef.current = sceneVersion(apiRef.current.getSceneElementsIncludingDeleted());
    setSaveState("saved");
    setLastSavedAt(row.updated_at);
    requestAnimationFrame(() => apiRef.current?.scrollToContent(undefined, { fitToContent: true, animate: true }));
  }

  async function renameProject(next: string) {
    const t = next.trim();
    if (!t || t === props.projectTitle) return;
    setTitle(t);
    const d = { ...dslRef.current, title: t };
    setDsl(d);
    dslRef.current = d;
    try {
      await api.patch(`/api/projects/${props.projectId}`, { title: t });
      router.refresh();
    } catch (err) {
      toast.error("Could not rename", { description: errorMessage(err) });
    }
  }

  // ── Exports ──
  const exportActions = {
    png: async () => {
      if (!apiRef.current) return;
      try {
        downloadBlob(await exportPng(apiRef.current), `${safeFilename(title)}.png`);
      } catch (err) {
        toast.error("PNG export failed", { description: errorMessage(err) });
      }
    },
    svg: async () => {
      if (!apiRef.current) return;
      try {
        downloadBlob(await exportSvg(apiRef.current), `${safeFilename(title)}.svg`);
      } catch (err) {
        toast.error("SVG export failed", { description: errorMessage(err) });
      }
    },
    excalidraw: async () => {
      if (!apiRef.current) return;
      downloadBlob(await exportExcalidrawFile(apiRef.current), `${safeFilename(title)}.excalidraw`);
    },
    sceneImages: async () => {
      if (!apiRef.current) return;
      const t = toast.loading("Rendering scene images…");
      try {
        const { scenes } = await api.get<{ scenes: PresentationScene[] }>(`/api/presentations/${props.presentation.id}/scenes`);
        if (!scenes.length) {
          toast.error("No scenes yet", { id: t, description: "Create scenes in the presentation studio first." });
          return;
        }
        const elements = getElements(apiRef.current);
        const fmt = props.presentation.active_format;
        await exportSceneImages(
          {
            title,
            diagram: collect().dsl,
            scenes,
            format: fmt,
            config: fmt === "portrait" ? props.presentation.portrait_config : props.presentation.landscape_config,
            colors: getNodeStyles(elements),
            editorBoxes: getNodeBoxes(elements),
          },
          (d, n) => toast.loading(`Rendering scene ${d} of ${n}…`, { id: t }),
        );
        toast.success("Scene images downloaded", { id: t });
      } catch (err) {
        toast.error("Scene export failed", { id: t, description: errorMessage(err) });
      }
    },
    json: async () => {
      if (!apiRef.current) return;
      const snap = collect();
      const { scenes } = await api.get<{ scenes: PresentationScene[] }>(`/api/presentations/${props.presentation.id}/scenes`).catch(() => ({ scenes: [] as PresentationScene[] }));
      exportProjectJson({ title, diagram: snap.dsl, excalidraw: snap.excalidraw, presentation: props.presentation, scenes });
    },
    video: () => router.push(`${studioHref}?export=video`),
  };

  const saveIndicator = (
    <button
      onClick={() => (saveState === "error" || saveState === "dirty" ? void save() : undefined)}
      className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-xs", saveState === "error" ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground")}
      aria-live="polite"
      title={`Last saved ${relativeTime(lastSavedAt)}`}
    >
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
      {saveState === "dirty" && <>Unsaved changes</>}
      {saveState === "error" && (
        <>
          <CloudOff className="size-3.5" /> Save failed · Retry
        </>
      )}
    </button>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Top toolbar */}
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
        <Tooltip content="Back to dashboard">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/dashboard" aria-label="Back to dashboard">
              <ArrowLeft />
            </Link>
          </Button>
        </Tooltip>
        <Tooltip content={leftOpen ? "Hide outline" : "Show outline"}>
          <Button variant="ghost" size="icon-sm" onClick={() => setLeftOpen((o) => !o)} aria-label="Toggle outline" className="hidden sm:inline-flex">
            <PanelLeft />
          </Button>
        </Tooltip>
        <Input
          key={title}
          defaultValue={title}
          onBlur={(e) => void renameProject(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-8 w-40 border-transparent bg-transparent px-2 font-medium hover:border-input sm:w-64"
          aria-label="Project title"
          maxLength={120}
        />
        {saveIndicator}
        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <Tooltip content="Undo (Ctrl/⌘ Z)">
          <Button variant="ghost" size="icon-sm" onClick={() => triggerHistory("undo")} aria-label="Undo" className="hidden sm:inline-flex" disabled={!apiReady}>
            <Undo2 />
          </Button>
        </Tooltip>
        <Tooltip content="Redo (Ctrl/⌘ Shift Z)">
          <Button variant="ghost" size="icon-sm" onClick={() => triggerHistory("redo")} aria-label="Redo" className="hidden sm:inline-flex" disabled={!apiReady}>
            <Redo2 />
          </Button>
        </Tooltip>
        <NativeSelect
          value={dsl.type}
          onChange={(e) => {
            const t = e.target.value as DiagramType;
            void updateDiagram({ type: t }, t === "sequence" || dsl.type === "sequence");
          }}
          className="ml-1 hidden w-44 md:block"
          aria-label="Diagram format"
        >
          {DIAGRAM_TYPES.map((t) => (
            <option key={t} value={t}>
              {DIAGRAM_TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>

        <div className="ml-auto flex items-center gap-1">
          <Tooltip content="Version history">
            <Button variant="ghost" size="icon-sm" onClick={() => setVersionsOpen(true)} aria-label="Version history">
              <History />
            </Button>
          </Tooltip>
          <Tooltip content="AI settings">
            <Button variant="ghost" size="icon-sm" onClick={() => setSettingsOpen(true)} aria-label="AI settings">
              <Settings2 />
            </Button>
          </Tooltip>
          <ExportMenu actions={exportActions} disabled={!apiReady} compact />
          <Button size="sm" asChild className={cn(dsl.nodes.length === 0 && "pointer-events-none opacity-50")}>
            <Link href={studioHref} aria-disabled={dsl.nodes.length === 0}>
              <Play /> <span className="hidden sm:inline">Present</span>
            </Link>
          </Button>
          <Tooltip content={rightOpen ? "Hide panel" : "Show AI & properties"}>
            <Button variant="ghost" size="icon-sm" onClick={() => setRightOpen((o) => !o)} aria-label="Toggle side panel">
              <PanelRight />
            </Button>
          </Tooltip>
        </div>
      </header>

      {draft && (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-sm">
          <TriangleAlert className="size-4 text-primary" />
          Unsaved changes from {relativeTime(draft.savedAt)} were found in this browser.
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              if (!apiRef.current) return;
              await setSceneElements(apiRef.current, draft.excalidraw.elements);
              setDsl(draft.dsl);
              dslRef.current = draft.dsl;
              setDraft(null);
              void save({ force: true });
            }}
          >
            Restore them
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              localStorage.removeItem(DRAFT_KEY(diagramId));
              setDraft(null);
            }}
          >
            Discard
          </Button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Left sidebar */}
        {leftOpen && (
          <aside className="absolute inset-y-0 left-0 z-20 w-64 shrink-0 border-r bg-sidebar lg:static">
            <OutlinePanel diagram={dsl} selectedNodeIds={selectedNodeIds} onSelectNode={selectNode} onSelectEdge={selectEdge} sceneCount={sceneCount} studioHref={studioHref} />
          </aside>
        )}

        {/* Canvas */}
        <section className="relative min-w-0 flex-1" aria-label="Diagram canvas">
          <ExcalidrawCanvas
            initialData={props.diagram.excalidraw_data}
            theme={theme}
            onApi={(a) => {
              apiRef.current = a;
              setApiReady(true);
            }}
            onChange={onCanvasChange}
          />
        </section>

        {/* Right sidebar */}
        {rightOpen && (
          <aside className="absolute inset-y-0 right-0 z-20 flex w-[min(100%,22rem)] shrink-0 flex-col border-l bg-sidebar md:static">
            <Tabs value={rightTab} onValueChange={setRightTab} className="flex min-h-0 flex-1 flex-col">
              <div className="border-b p-2">
                <TabsList className="w-full">
                  <TabsTrigger value="assistant">AI assistant</TabsTrigger>
                  <TabsTrigger value="properties">Properties</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="assistant" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
                <AssistantPanel
                  diagram={dsl}
                  settings={settings}
                  cloudConfigured={props.cloud.configured}
                  selectedNodeIds={selectedNodeIds}
                  onProviderChange={(p) => void changeProvider(p)}
                  onOpenSettings={() => setSettingsOpen(true)}
                  pendingPrompt={apiReady ? pendingPrompt : null}
                  externalPrompt={assistantPrompt}
                  onPendingConsumed={() => {
                    try {
                      sessionStorage.removeItem(PENDING_PROMPT_KEY(props.projectId));
                    } catch {
                      /* ignore */
                    }
                  }}
                  {...assistant}
                />
              </TabsContent>
              <TabsContent value="properties" className="min-h-0 flex-1 overflow-y-auto scroll-thin">
                <InspectorPanel
                  diagram={dsl}
                  selectedNodeIds={selectedNodeIds}
                  selectedEdgeIds={selectedEdgeIds}
                  onUpdateNode={(id, p) => void updateNode(id, p)}
                  onUpdateEdge={(id, p) => void updateEdge(id, p)}
                  onUpdateDiagram={(p, r) => void updateDiagram(p, r)}
                  onRelayout={() => void applyDiagram(collect().dsl, { relayout: true, versionDescription: "Tidied up layout" })}
                  onExplain={(id) => {
                    selectNode(id);
                    setRightTab("assistant");
                    setAssistantPrompt({ text: "Explain the selected component", nonce: Date.now() });
                  }}
                  studioHref={studioHref}
                />
              </TabsContent>
            </Tabs>
          </aside>
        )}
      </div>

      <VersionsDialog
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        diagramId={diagramId}
        onSaveVersion={async (description) => {
          const ok = await save({ createVersion: description });
          if (!ok) throw new Error("Save failed");
        }}
        onRestored={(row) => void restoreFromRow(row)}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>AI provider</DialogTitle>
            <DialogDescription>Choose where diagrams are generated. Requests never switch providers on their own.</DialogDescription>
          </DialogHeader>
          <ProviderSettingsForm
            initial={settings}
            cloud={props.cloud}
            compact
            onSaved={(s) => {
              setSettings(s);
              setSettingsOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
