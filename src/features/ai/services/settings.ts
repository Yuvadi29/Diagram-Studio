import { publicEnv } from "@/lib/env";
import type { UserPreferences } from "@/lib/supabase/types";

export interface AISettings {
  provider: "gemini" | "ollama";
  ollamaUrl: string;
  ollamaModel: string;
}

export function settingsFromPreferences(p: UserPreferences | null | undefined): AISettings {
  return {
    provider: p?.provider ?? "gemini",
    ollamaUrl: p?.ollamaUrl || publicEnv.ollamaDefaultUrl,
    ollamaModel: p?.ollamaModel || publicEnv.ollamaDefaultModel,
  };
}

export const PROVIDER_LABELS: Record<AISettings["provider"], string> = {
  gemini: "Cloud AI (Gemini)",
  ollama: "Local (Ollama)",
};
