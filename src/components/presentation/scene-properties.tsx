"use client";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Sparkle, SunDim } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DiagramDSL } from "@/features/diagrams/schema/dsl";
import { cameraFor, FORMAT_LABELS, type CameraSetting, type PresentationFormat, type PresentationScene } from "@/features/presentations";
import { NodeIcon } from "@/components/editor/node-icon";

type Patch = Partial<PresentationScene>;

function toggle(list: string[] | undefined, id: string, on: boolean) {
  const s = new Set(list ?? []);
  if (on) s.add(id);
  else s.delete(id);
  return [...s];
}

export function SceneProperties({
  scene,
  previous,
  diagram,
  format,
  nodeCenters,
  onChange,
}: {
  scene: PresentationScene;
  previous?: PresentationScene;
  diagram: DiagramDSL;
  format: PresentationFormat;
  /** Node centres in this format's coordinates (for "centre on"). */
  nodeCenters: Record<string, { x: number; y: number }>;
  onChange: (patch: Patch) => void;
}) {
  const [title, setTitle] = useState(scene.title);
  const [description, setDescription] = useState(scene.description ?? "");
  useEffect(() => {
    setTitle(scene.title);
    setDescription(scene.description ?? "");
  }, [scene.id, scene.title, scene.description]);

  const visible = new Set(scene.visibleNodeIds);
  const hi = new Set(scene.highlightedNodeIds ?? []);
  const dim = new Set(scene.dimmedNodeIds ?? []);
  const visEdges = new Set(scene.visibleEdgeIds);
  const hiEdges = new Set(scene.highlightedEdgeIds ?? []);
  const camera = cameraFor(scene, format);
  const label = (id: string) => diagram.nodes.find((n) => n.id === id)?.label ?? id;

  const setNodeVisible = (id: string, on: boolean) => {
    const patch: Patch = { visibleNodeIds: toggle(scene.visibleNodeIds, id, on) };
    if (!on) {
      patch.highlightedNodeIds = toggle(scene.highlightedNodeIds, id, false);
      patch.dimmedNodeIds = toggle(scene.dimmedNodeIds, id, false);
    } else {
      // Reveal connections to other visible nodes automatically.
      const extra = diagram.edges.filter((e) => (e.source === id && visible.has(e.target)) || (e.target === id && visible.has(e.source)) || (e.source === id && e.target === id)).map((e) => e.id);
      patch.visibleEdgeIds = [...new Set([...scene.visibleEdgeIds, ...extra])];
    }
    onChange(patch);
  };
  const setCamera = (c: CameraSetting) => onChange({ cameraByFormat: { ...(scene.cameraByFormat ?? {}), [format]: c } });

  return (
    <div className="grid gap-5 p-4">
      <div className="grid gap-2">
        <Label htmlFor="scene-title">Title</Label>
        <Input id="scene-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== scene.title && onChange({ title: title.trim() })} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="scene-desc">Narration</Label>
        <Textarea
          id="scene-desc"
          rows={3}
          maxLength={1200}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (scene.description ?? "") && onChange({ description: description.trim() || undefined })}
          placeholder="What should the viewer understand in this scene?"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="scene-dur">Duration (s)</Label>
          <Input
            id="scene-dur"
            type="number"
            min={0.5}
            max={120}
            step={0.5}
            value={scene.durationMs / 1000}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 0.5 && v <= 120) onChange({ durationMs: Math.round(v * 1000) });
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="scene-tr">Transition</Label>
          <NativeSelect
            id="scene-tr"
            value={scene.transition.type}
            onChange={(e) => {
              const type = e.target.value as PresentationScene["transition"]["type"];
              onChange({ transition: { type, durationMs: type === "none" ? 0 : scene.transition.durationMs || (type === "zoom" ? 900 : 600) } });
            }}
          >
            <option value="fade">Fade</option>
            <option value="zoom">Zoom</option>
            <option value="none">None</option>
          </NativeSelect>
        </div>
      </div>
      {scene.transition.type !== "none" && (
        <div className="grid gap-2">
          <Label className="flex justify-between">
            Transition length <span className="font-normal text-muted-foreground">{(scene.transition.durationMs / 1000).toFixed(1)}s</span>
          </Label>
          <Slider min={100} max={3000} step={100} value={[scene.transition.durationMs]} onValueChange={([v]) => onChange({ transition: { ...scene.transition, durationMs: v } })} />
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="scene-cam">Camera ({FORMAT_LABELS[format]})</Label>
        <NativeSelect id="scene-cam" value={camera.mode} onChange={(e) => setCamera({ mode: e.target.value as CameraSetting["mode"], ...(e.target.value === "custom" ? { zoom: 1.5 } : {}) })}>
          <option value="auto">Fit visible components</option>
          <option value="highlighted">Focus highlighted components</option>
          <option value="all">Whole diagram</option>
          <option value="custom">Custom zoom</option>
        </NativeSelect>
        {camera.mode === "custom" && (
          <div className="grid gap-3 rounded-md border p-3">
            <Label className="flex justify-between text-xs">
              Zoom <span className="font-normal text-muted-foreground">{(camera.zoom ?? 1).toFixed(1)}×</span>
            </Label>
            <Slider min={0.5} max={4} step={0.1} value={[camera.zoom ?? 1]} onValueChange={([v]) => setCamera({ ...camera, zoom: v })} />
            <Label className="text-xs">Centre on</Label>
            <NativeSelect
              value={Object.entries(nodeCenters).find(([, c]) => c.x === camera.x && c.y === camera.y)?.[0] ?? ""}
              onChange={(e) => {
                const c = nodeCenters[e.target.value];
                setCamera({ mode: "custom", zoom: camera.zoom ?? 1.5, x: c?.x, y: c?.y });
              }}
            >
              <option value="">Diagram centre</option>
              {diagram.nodes
                .filter((n) => visible.has(n.id) && nodeCenters[n.id])
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
            </NativeSelect>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">Each format keeps its own camera.</p>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Components</Label>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onChange({ visibleNodeIds: diagram.nodes.map((n) => n.id), visibleEdgeIds: diagram.edges.map((e) => e.id) })}>
              All
            </Button>
            {previous && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => onChange({ visibleNodeIds: [...previous.visibleNodeIds], visibleEdgeIds: [...previous.visibleEdgeIds], highlightedNodeIds: [], highlightedEdgeIds: [], dimmedNodeIds: [] })}
              >
                Same as previous
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onChange({ visibleNodeIds: [], visibleEdgeIds: [], highlightedNodeIds: [], highlightedEdgeIds: [], dimmedNodeIds: [] })}>
              None
            </Button>
          </div>
        </div>
        <ul className="divide-y rounded-md border">
          {diagram.nodes.map((n) => {
            const v = visible.has(n.id);
            return (
              <li key={n.id} className={cn("flex items-center gap-2 px-2 py-1.5 text-sm", !v && "text-muted-foreground")}>
                <button onClick={() => setNodeVisible(n.id, !v)} aria-label={v ? `Hide ${n.label}` : `Show ${n.label}`} aria-pressed={v} className="text-muted-foreground hover:text-foreground">
                  {v ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </button>
                <NodeIcon type={n.type} />
                <span className="min-w-0 flex-1 truncate">{n.label}</span>
                <button
                  disabled={!v}
                  onClick={() => onChange({ highlightedNodeIds: toggle(scene.highlightedNodeIds, n.id, !hi.has(n.id)), dimmedNodeIds: toggle(scene.dimmedNodeIds, n.id, false) })}
                  aria-label={`Highlight ${n.label}`}
                  aria-pressed={hi.has(n.id)}
                  className={cn("rounded p-1 disabled:opacity-30", hi.has(n.id) ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                >
                  <Sparkle className="size-3.5" />
                </button>
                <button
                  disabled={!v}
                  onClick={() => onChange({ dimmedNodeIds: toggle(scene.dimmedNodeIds, n.id, !dim.has(n.id)), highlightedNodeIds: toggle(scene.highlightedNodeIds, n.id, false) })}
                  aria-label={`Dim ${n.label}`}
                  aria-pressed={dim.has(n.id)}
                  className={cn("rounded p-1 disabled:opacity-30", dim.has(n.id) ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  <SunDim className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {diagram.edges.length > 0 && (
        <div className="grid gap-2">
          <Label>Connections</Label>
          <ul className="divide-y rounded-md border">
            {diagram.edges.map((e) => {
              const endpointsVisible = visible.has(e.source) && visible.has(e.target);
              const v = visEdges.has(e.id);
              return (
                <li key={e.id} className={cn("flex items-center gap-2 px-2 py-1.5 text-xs", (!v || !endpointsVisible) && "text-muted-foreground")}>
                  <button
                    onClick={() => onChange({ visibleEdgeIds: toggle(scene.visibleEdgeIds, e.id, !v), highlightedEdgeIds: v ? toggle(scene.highlightedEdgeIds, e.id, false) : scene.highlightedEdgeIds })}
                    aria-label={v ? "Hide connection" : "Show connection"}
                    aria-pressed={v}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {v ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                  <span className="min-w-0 flex-1 truncate" title={!endpointsVisible ? "Both components must be visible" : undefined}>
                    {label(e.source)} → {label(e.target)}
                    {e.label ? ` · ${e.label}` : ""}
                  </span>
                  <button
                    disabled={!v}
                    onClick={() => onChange({ highlightedEdgeIds: toggle(scene.highlightedEdgeIds, e.id, !hiEdges.has(e.id)) })}
                    aria-label="Highlight connection"
                    aria-pressed={hiEdges.has(e.id)}
                    className={cn("rounded p-1 disabled:opacity-30", hiEdges.has(e.id) ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                  >
                    <Sparkle className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
