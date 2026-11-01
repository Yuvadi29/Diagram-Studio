import { describe, expect, it } from "vitest";
import { DiagramDSLSchema } from "@/features/diagrams/schema/dsl";
import { buildPresentationModel, DEFAULT_FORMATS, effectiveFormatConfig, PresentationSceneSchema, renderFrameSvg, staticFrame } from "@/features/presentations";
import { TOPICS } from "@/components/landing/topics";

describe("landing topics", () => {
  for (const t of TOPICS) {
    describe(t.label, () => {
      it("has valid before, after and union diagrams", () => {
        for (const d of [t.before, t.after, t.union]) {
          const r = DiagramDSLSchema.safeParse(d);
          expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
        }
      });

      it("scenes are valid and only reference nodes of the edited diagram", () => {
        const nodes = new Set(t.after.nodes.map((n) => n.id));
        const edges = new Set(t.after.edges.map((e) => e.id));
        expect(t.scenes).toHaveLength(4);
        for (const s of t.scenes) {
          expect(PresentationSceneSchema.safeParse(s).success).toBe(true);
          for (const id of [...s.visibleNodeIds, ...(s.highlightedNodeIds ?? [])]) expect(nodes.has(id)).toBe(true);
          for (const id of [...s.visibleEdgeIds, ...(s.highlightedEdgeIds ?? [])]) expect(edges.has(id)).toBe(true);
        }
        // The last scene shows the whole diagram.
        expect(new Set(t.scenes[3].visibleNodeIds).size).toBe(t.after.nodes.length);
      });

      it("the edit adds what the diff says", () => {
        const before = new Set(t.before.nodes.map((n) => n.id));
        const added = t.after.nodes.filter((n) => !before.has(n.id)).map((n) => n.label);
        const diffAdds = t.diff.filter((d) => d.kind === "add" && !d.text.includes("→")).map((d) => d.text);
        expect(added).toEqual(diffAdds);
      });

      it("renders in both formats", () => {
        for (const f of ["landscape", "portrait"] as const) {
          const m = buildPresentationModel(t.after, f, effectiveFormatConfig(t.after, f, DEFAULT_FORMATS[f]), { theme: "dark" });
          expect(m.nodes).toHaveLength(t.after.nodes.length);
          for (const s of t.scenes) {
            const svg = renderFrameSvg(m, staticFrame(m, s), { responsive: true, idPrefix: `t-${t.id}` });
            expect(svg.startsWith("<svg")).toBe(true);
            expect(svg).not.toContain("NaN");
          }
        }
        const u = buildPresentationModel(t.union, "landscape", effectiveFormatConfig(t.union, "landscape", DEFAULT_FORMATS.landscape), { theme: "light" });
        expect(u.nodes).toHaveLength(t.union.nodes.length);
      });
    });
  }
});
