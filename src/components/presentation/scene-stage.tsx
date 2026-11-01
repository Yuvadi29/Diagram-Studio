"use client";
import { useMemo, useRef, useState } from "react";
import { renderFrameSvg, type FrameState, type PresentationModel } from "@/features/presentations";
import type { Box } from "@/features/layout";
import { cn } from "@/lib/utils";
import { useFitBox } from "./use-fit-box";

/**
 * Renders a presentation frame (pure SVG) fitted to its container.
 * In `editable` mode, nodes can be dragged to adjust this format's layout.
 */
export function SceneStage({
  model,
  frame,
  editable = false,
  onNodeMoved,
  className,
  showCaption = true,
}: {
  model: PresentationModel;
  frame: FrameState;
  editable?: boolean;
  onNodeMoved?: (nodeId: string, box: Box) => void;
  className?: string;
  showCaption?: boolean;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const size = useFitBox(outer, model.width / model.height, 0);
  const [drag, setDrag] = useState<{ id: string; startX: number; startY: number; box: Box; current: Box; frame: FrameState } | null>(null);

  const renderModel = useMemo(() => {
    if (!drag) return model;
    return { ...model, nodes: model.nodes.map((n) => (n.id === drag.id ? { ...n, box: drag.current } : n)) };
  }, [model, drag]);

  const svg = useMemo(
    () => renderFrameSvg(renderModel, drag ? drag.frame : frame, { responsive: true, interactive: editable, showCaption }),
    [renderModel, frame, drag, editable, showCaption],
  );

  const scaleToDiagram = () => {
    const vb = (drag ? drag.frame : frame).viewBox;
    const s = Math.min(model.stage.width / vb.width, model.stage.height / vb.height);
    const css = size.width / model.width;
    return 1 / (s * css);
  };

  return (
    <div ref={outer} className={cn("flex h-full w-full items-center justify-center", className)}>
      <div
        style={{ width: size.width, height: size.height }}
        className={cn("overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/10", editable && "touch-none")}
        onPointerDown={(e) => {
          if (!editable) return;
          const target = (e.target as Element).closest("[data-node-id]");
          const id = target?.getAttribute("data-node-id");
          const node = id ? model.nodes.find((n) => n.id === id) : undefined;
          if (!node || (frame.nodes[node.id]?.opacity ?? 0) < 0.05) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setDrag({ id: node.id, startX: e.clientX, startY: e.clientY, box: node.box, current: node.box, frame });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const k = scaleToDiagram();
          setDrag({ ...drag, current: { ...drag.box, x: Math.round(drag.box.x + (e.clientX - drag.startX) * k), y: Math.round(drag.box.y + (e.clientY - drag.startY) * k) } });
        }}
        onPointerUp={() => {
          if (!drag) return;
          if (drag.current.x !== drag.box.x || drag.current.y !== drag.box.y) onNodeMoved?.(drag.id, drag.current);
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
