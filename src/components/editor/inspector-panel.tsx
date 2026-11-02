"use client";
import { useEffect, useState } from "react";
import { ArrowRight, LayoutGrid, MessageSquareText, MoveHorizontal, MoveVertical, Presentation } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DIAGRAM_TYPE_LABELS, DIAGRAM_TYPES, NODE_TYPE_LABELS, NODE_TYPES, type DiagramDSL, type DiagramEdge, type DiagramNode, type DiagramType } from "@/features/diagrams/schema/dsl";

/** Commit text on blur/Enter so typing doesn't trigger a canvas sync per keystroke. */
function useDraft(value: string) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return [draft, setDraft] as const;
}

export function InspectorPanel({
  diagram,
  selectedNodeIds,
  selectedEdgeIds,
  onUpdateNode,
  onUpdateEdge,
  onUpdateDiagram,
  onRelayout,
  onExplain,
  studioHref,
}: {
  diagram: DiagramDSL;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  onUpdateNode: (id: string, patch: Partial<DiagramNode>) => void;
  onUpdateEdge: (id: string, patch: Partial<DiagramEdge>) => void;
  onUpdateDiagram: (patch: Partial<Pick<DiagramDSL, "title" | "description" | "type" | "layout">>, relayout?: boolean) => void;
  onRelayout: () => void;
  onExplain: (nodeId: string) => void;
  studioHref: string;
}) {
  const node = selectedNodeIds.length === 1 ? diagram.nodes.find((n) => n.id === selectedNodeIds[0]) : undefined;
  const edge = !node && selectedEdgeIds.length === 1 ? diagram.edges.find((e) => e.id === selectedEdgeIds[0]) : undefined;
  if (node) return <NodeInspector key={node.id} node={node} diagram={diagram} onUpdate={(p) => onUpdateNode(node.id, p)} onExplain={() => onExplain(node.id)} />;
  if (edge) return <EdgeInspector key={edge.id} edge={edge} diagram={diagram} onUpdate={(p) => onUpdateEdge(edge.id, p)} />;
  if (selectedNodeIds.length > 1)
    return <p className="p-4 text-sm text-muted-foreground">{selectedNodeIds.length} components selected. Select a single component to edit its properties.</p>;
  return <DiagramInspector diagram={diagram} onUpdate={onUpdateDiagram} onRelayout={onRelayout} studioHref={studioHref} />;
}

function NodeInspector({ node, diagram, onUpdate, onExplain }: { node: DiagramNode; diagram: DiagramDSL; onUpdate: (p: Partial<DiagramNode>) => void; onExplain: () => void }) {
  const [label, setLabel] = useDraft(node.label);
  const [description, setDescription] = useDraft(node.description ?? "");
  return (
    <div className="grid gap-4 p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Component</p>
      <div className="grid gap-2">
        <Label htmlFor="node-label">Label</Label>
        <Input
          id="node-label"
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label.trim() && label !== node.label && onUpdate({ label: label.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="node-type">Type</Label>
        <NativeSelect id="node-type" value={node.type} onChange={(e) => onUpdate({ type: e.target.value as DiagramNode["type"] })}>
          {NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {NODE_TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="node-desc">Description</Label>
        <Textarea
          id="node-desc"
          rows={3}
          maxLength={600}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (node.description ?? "") && onUpdate({ description: description.trim() || undefined })}
          placeholder="What does this component do? Used in presentations."
        />
      </div>
      {(diagram.groups?.length ?? 0) > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="node-group">Group</Label>
          <NativeSelect id="node-group" value={node.groupId ?? ""} onChange={(e) => onUpdate({ groupId: e.target.value || undefined })}>
            <option value="">No group</option>
            {diagram.groups!.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <label className="flex items-center justify-between gap-3 text-sm">
        Highlight
        <Switch checked={Boolean(node.style?.highlight)} onCheckedChange={(v) => onUpdate({ style: v ? { highlight: true } : undefined })} />
      </label>
      <Button variant="outline" size="sm" onClick={onExplain}>
        <MessageSquareText /> Ask AI to explain this
      </Button>
      <p className="font-mono text-[11px] text-muted-foreground">id: {node.id}</p>
    </div>
  );
}

function EdgeInspector({ edge, diagram, onUpdate }: { edge: DiagramEdge; diagram: DiagramDSL; onUpdate: (p: Partial<DiagramEdge>) => void }) {
  const [label, setLabel] = useDraft(edge.label ?? "");
  const name = (id: string) => diagram.nodes.find((n) => n.id === id)?.label ?? id;
  return (
    <div className="grid gap-4 p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Connection</p>
      <p className="flex items-center gap-2 text-sm">
        <span className="truncate">{name(edge.source)}</span> <ArrowRight className="size-4 shrink-0" /> <span className="truncate">{name(edge.target)}</span>
      </p>
      <div className="grid gap-2">
        <Label htmlFor="edge-label">Label</Label>
        <Input
          id="edge-label"
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label !== (edge.label ?? "") && onUpdate({ label: label.trim() || undefined })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="edge-type">Style</Label>
        <NativeSelect id="edge-type" value={edge.type ?? "default"} onChange={(e) => onUpdate({ type: e.target.value === "default" ? undefined : (e.target.value as DiagramEdge["type"]) })}>
          <option value="default">Solid arrow</option>
          <option value="dashed">Dashed (async / response)</option>
          <option value="bidirectional">Two-way</option>
        </NativeSelect>
      </div>
    </div>
  );
}

function DiagramInspector({
  diagram,
  onUpdate,
  onRelayout,
  studioHref,
}: {
  diagram: DiagramDSL;
  onUpdate: (patch: Partial<Pick<DiagramDSL, "title" | "description" | "type" | "layout">>, relayout?: boolean) => void;
  onRelayout: () => void;
  studioHref: string;
}) {
  const [description, setDescription] = useDraft(diagram.description ?? "");
  const empty = diagram.nodes.length === 0;
  return (
    <div className="grid gap-4 p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Diagram</p>
      <div className="grid gap-2">
        <Label htmlFor="d-type">Diagram type</Label>
        <NativeSelect
          id="d-type"
          value={diagram.type}
          onChange={(e) => {
            const t = e.target.value as DiagramType;
            onUpdate({ type: t }, t === "sequence" || diagram.type === "sequence");
          }}
        >
          {DIAGRAM_TYPES.map((t) => (
            <option key={t} value={t}>
              {DIAGRAM_TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="d-desc">Description</Label>
        <Textarea
          id="d-desc"
          rows={3}
          maxLength={600}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (diagram.description ?? "") && onUpdate({ description: description.trim() || undefined })}
          placeholder="What does this diagram explain?"
        />
      </div>
      <div className="grid gap-2">
        <Label>Layout direction</Label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { v: "left-to-right", label: "Horizontal", icon: MoveHorizontal },
              { v: "top-to-bottom", label: "Vertical", icon: MoveVertical },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              disabled={empty}
              onClick={() => diagram.layout !== o.v && onUpdate({ layout: o.v }, true)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs disabled:opacity-50",
                diagram.layout === o.v ? "border-brand bg-brand/5 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <o.icon className="size-3.5" /> {o.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Changing direction re-arranges the diagram. You can undo it.</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRelayout} disabled={empty}>
        <LayoutGrid /> Tidy up layout
      </Button>
      <Button asChild variant="secondary" size="sm" disabled={empty}>
        <Link href={studioHref}>
          <Presentation /> Turn into a presentation
        </Link>
      </Button>
    </div>
  );
}
