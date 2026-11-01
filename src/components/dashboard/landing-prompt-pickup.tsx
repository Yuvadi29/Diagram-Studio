"use client";
import { useEffect, useState } from "react";
import { LANDING_PROMPT_KEY } from "@/features/diagrams/services/examples";
import { NewDiagramDialog } from "./new-diagram-dialog";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Opens the new-diagram dialog with a prompt the visitor wrote on the landing page. */
export function LandingPromptPickup() {
  const [prompt, setPrompt] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LANDING_PROMPT_KEY);
      if (!raw) return;
      localStorage.removeItem(LANDING_PROMPT_KEY);
      const data = JSON.parse(raw) as { prompt?: unknown; at?: unknown };
      if (typeof data.prompt === "string" && data.prompt.trim() && typeof data.at === "number" && Date.now() - data.at < MAX_AGE_MS) {
        setPrompt(data.prompt.trim().slice(0, 4000));
      }
    } catch {
      /* storage unavailable or malformed: nothing to pick up */
    }
  }, []);
  if (!prompt) return null;
  return <NewDiagramDialog defaultOpen initialPrompt={{ prompt, type: "auto" }} />;
}
