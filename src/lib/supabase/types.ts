import type { DiagramDSL } from "@/features/diagrams/schema/dsl";
import type { PresentationFormatConfig } from "@/features/presentations/formats";
import type { PresentationScene } from "@/features/presentations/scenes/schema";

/** Row types for the tables in supabase/migrations. */

export interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  preferences: UserPreferences;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  provider?: "gemini" | "ollama";
  ollamaUrl?: string;
  ollamaModel?: string;
  theme?: "dark" | "light";
}

export interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExcalidrawData {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

export interface DiagramRow {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  diagram_type: string;
  diagram_dsl: DiagramDSL;
  excalidraw_data: ExcalidrawData;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface DiagramVersionRow {
  id: string;
  diagram_id: string;
  user_id: string;
  version_number: number;
  diagram_dsl: DiagramDSL;
  excalidraw_data: ExcalidrawData;
  change_description: string | null;
  created_at: string;
}

export interface PresentationRow {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  active_format: "landscape" | "portrait";
  landscape_config: PresentationFormatConfig;
  portrait_config: PresentationFormatConfig;
  created_at: string;
  updated_at: string;
}

export interface SceneRow {
  id: string;
  presentation_id: string;
  title: string;
  description: string | null;
  order_index: number;
  scene_data: PresentationScene;
  created_at: string;
  updated_at: string;
}

export interface ExportRow {
  id: string;
  project_id: string;
  presentation_id: string | null;
  user_id: string;
  format: "mp4-landscape" | "mp4-portrait";
  status: "queued" | "rendering" | "completed" | "failed" | "cancelled";
  progress: number;
  file_url: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface AIUsageRow {
  id: string;
  user_id: string;
  provider: "gemini" | "ollama";
  model: string;
  operation: "generate" | "refine" | "scenes";
  input_tokens: number | null;
  output_tokens: number | null;
  status: "success" | "error";
  error_code: string | null;
  created_at: string;
}
