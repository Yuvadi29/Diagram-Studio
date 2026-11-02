"use client";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { PresentationScene } from "@/features/presentations";

function SceneItem({
  scene,
  index,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  scene: PresentationScene;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-1 rounded-lg border bg-card pr-1 transition-colors",
        selected ? "border-brand/60 bg-brand/5" : "hover:border-muted-foreground/30",
        isDragging && "z-10 shadow-xl",
      )}
    >
      <button className="cursor-grab touch-none px-1.5 py-3 text-muted-foreground active:cursor-grabbing" aria-label={`Reorder scene ${index + 1}`} {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </button>
      <button onClick={onSelect} className="min-w-0 flex-1 py-2 text-left" aria-current={selected ? "true" : undefined}>
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
          <span className="truncate text-sm font-medium">{scene.title}</span>
        </span>
        <span className="block pl-5 text-xs text-muted-foreground">
          {(scene.durationMs / 1000).toFixed(1)}s · {scene.visibleNodeIds.length} visible · {scene.transition.type}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-md p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent focus:opacity-100 data-[state=open]:opacity-100" aria-label="Scene actions">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function SceneList({
  scenes,
  selectedId,
  onSelect,
  onReorder,
  onDuplicate,
  onDelete,
  onAdd,
}: {
  scenes: PresentationScene[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = scenes.findIndex((s) => s.id === e.active.id);
    const to = scenes.findIndex((s) => s.id === e.over!.id);
    if (from >= 0 && to >= 0) onReorder(from, to);
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <span className="text-sm font-medium">Scenes</span>
        <Button size="sm" variant="ghost" onClick={onAdd}>
          <Plus /> Add
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 scroll-thin">
        {scenes.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">No scenes yet. Generate them with AI or build them step by step automatically.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ol className="grid gap-1.5">
                {scenes.map((s, i) => (
                  <SceneItem key={s.id} scene={s} index={i} selected={s.id === selectedId} onSelect={() => onSelect(s.id)} onDuplicate={() => onDuplicate(s.id)} onDelete={() => onDelete(s.id)} />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
