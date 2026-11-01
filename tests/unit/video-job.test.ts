import { describe, expect, it } from "vitest";
import { buildVideoProps } from "@/features/exports/worker/build-job";
import { excalidrawAdapter } from "@/features/excalidraw/adapter";
import { autoGenerateScenes, DEFAULT_FORMATS, totalDurationMs } from "@/features/presentations";
import { ragDiagram } from "../fixtures/diagrams";

describe("video job builder", () => {
  const scenes = autoGenerateScenes(ragDiagram);
  const rows = {
    diagram: { id: "rag", title: "RAG", diagram_dsl: ragDiagram, excalidraw_data: { elements: excalidrawAdapter.toExcalidrawElements(ragDiagram) } },
    presentation: { landscape_config: DEFAULT_FORMATS.landscape, portrait_config: DEFAULT_FORMATS.portrait },
    scenes: scenes.map((s) => ({ id: s.id, title: s.title, description: s.description ?? null, order_index: s.order, scene_data: s as unknown as Record<string, unknown> })),
  };

  it("builds a renderable model in the requested format", () => {
    const land = buildVideoProps(rows, "landscape");
    const port = buildVideoProps(rows, "portrait");
    expect([land.model.width, land.model.height]).toEqual([1920, 1080]);
    expect([port.model.width, port.model.height]).toEqual([1080, 1920]);
    expect(land.scenes).toHaveLength(scenes.length);
    expect(totalDurationMs(land.scenes)).toBeGreaterThan(0);
    // Landscape mirrors the editor canvas positions.
    const editorUser = rows.diagram.excalidraw_data.elements.find((e) => e.customData?.dsId === "user" && e.customData?.dsKind === "node")!;
    expect(land.model.nodes.find((n) => n.id === "user")!.box.x).toBe(editorUser.x);
  });

  it("fails clearly without scenes", () => {
    expect(() => buildVideoProps({ ...rows, scenes: [] }, "landscape")).toThrow(/no valid scenes/);
  });
});
