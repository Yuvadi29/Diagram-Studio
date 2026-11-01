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
  gemini: "Gemini (your API key)",
  ollama: "Local (Ollama)",
};

/** What the UI knows about the user's cloud (Gemini) setup. The key itself is never sent to the browser. */
export interface CloudStatus {
  /** Key saved AND model chosen: cloud AI is ready. */
  configured: boolean;
  hasKey: boolean;
  /** e.g. "…a1B2" */
  keyHint: string | null;
  model: string | null;
  /** False when the server can't store keys (API_KEY_ENCRYPTION_SECRET missing). */
  storageReady: boolean;
}

export interface GeminiModelOption {
  id: string;
  displayName: string;
  description?: string;
  inputTokenLimit?: number;
}
