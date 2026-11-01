"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DIAGRAM_TYPE_LABELS, type DiagramDSL } from "@/features/diagrams/schema/dsl";
import { NodeIcon } from "./node-icon";

export function OutlinePanel({
  diagram,
  selectedNodeIds,
  onSelectNode,
  onSelectEdge,
  sceneCount,
  studioHref,
}: {
  diagram: DiagramDSL;
  selectedNodeIds: string[];
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  sceneCount: number | null;
  studioHref: string;
}) {
  const [showEdges, setShowEdges] = useState(true);
  const label = (id: string) => diagram.nodes.find((n) => n.id === id)?.label ?? id;
  const groups = diagram.groups ?? [];
  const ungrouped = diagram.nodes.filter((n) => !n.groupId);

  const nodeButton = (n: DiagramDSL["nodes"][number]) => (
    <li key={n.id}>
      <button
        onClick={() => onSelectNode(n.id)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
          selectedNodeIds.includes(n.id) && "bg-accent text-foreground",
        )}
        title={n.description}
      >
        <NodeIcon type={n.type} />
        <span className="truncate">{n.label}</span>
        {n.style?.highlight && <span className="ml-auto size-1.5 rounded-full bg-primary" aria-label="highlighted" />}
      </button>
    </li>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-3 py-3">
        <p className="truncate text-sm font-medium" title={diagram.title}>
          {diagram.title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {DIAGRAM_TYPE_LABELS[diagram.type]} · {diagram.nodes.length} components · {diagram.edges.length} connections
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 scroll-thin">
        {diagram.nodes.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">No components yet. Generate a diagram with AI or draw labelled shapes on the canvas.</p>
        ) : (
          <>
            {groups.map((g) => (
              <div key={g.id} className="mb-2">
                <p className="px-2 pt-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{g.label}</p>
                <ul>{diagram.nodes.filter((n) => n.groupId === g.id).map(nodeButton)}</ul>
              </div>
            ))}
            {ungrouped.length > 0 && (
              <div className="mb-2">
                {groups.length > 0 && <p className="px-2 pt-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Other</p>}
                <ul>{ungrouped.map(nodeButton)}</ul>
              </div>
            )}
            {diagram.edges.length > 0 && (
              <div className="mt-2 border-t pt-2">
                <button className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase" onClick={() => setShowEdges((s) => !s)}>
                  <ChevronRight className={cn("size-3 transition-transform", showEdges && "rotate-90")} /> Connections
                </button>
                {showEdges && (
                  <ul>
                    {diagram.edges.map((e) => (
                      <li key={e.id}>
                        <button onClick={() => onSelectEdge(e.id)} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                          <span className="truncate">{label(e.source)}</span>
                          <ArrowRight className="size-3 shrink-0" />
                          <span className="truncate">{label(e.target)}</span>
                          {e.label && <span className="ml-auto truncate pl-2 text-[11px] opacity-70">{e.label}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <div className="border-t p-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Presentation className="size-4 text-primary" /> Presentation
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{sceneCount === null ? "Loading…" : sceneCount === 0 ? "No scenes yet" : `${sceneCount} scene${sceneCount === 1 ? "" : "s"}`}</p>
          <Button asChild size="sm" variant="secondary" className="mt-2 w-full" disabled={diagram.nodes.length === 0}>
            <Link href={studioHref}>{sceneCount ? "Edit scenes" : "Create scenes"}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
