/** Convenience re-exports of the core domain types. */
export type { DiagramDSL, DiagramNode, DiagramEdge, DiagramGroup, DiagramType, NodeType, DiagramContext } from "@/features/diagrams/schema/dsl";
export type { PresentationScene, PresentationFormat, CameraSetting, SceneTransition } from "@/features/presentations/scenes/schema";
export type { PresentationFormatConfig, PresentationFormats } from "@/features/presentations/formats";
export type { AIProvider, AIProviderId, RefinementResult } from "@/features/ai/providers/types";
export type * from "@/lib/supabase/types";
