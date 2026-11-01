"use client";
import { useState } from "react";
import { EXAMPLE_PROMPTS, LANDING_PROMPT_KEY } from "@/features/diagrams/services/examples";

/**
 * The closing call to action is the product's first step: write the prompt
 * here and it is waiting in the new-diagram dialog after Google sign-in.
 */
export function FinalCta({ signedIn }: { signedIn: boolean }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const target = signedIn ? "/dashboard" : "/login?next=%2Fdashboard";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (text) {
      try {
        localStorage.setItem(LANDING_PROMPT_KEY, JSON.stringify({ prompt: text, at: Date.now() }));
      } catch {
        /* storage unavailable: the visitor just starts with an empty prompt */
      }
    }
    setBusy(true);
    window.location.assign(target);
  }

  return (
    <form className="fc-form" onSubmit={submit}>
      <label htmlFor="fc-prompt" className="fc-label">
        What do you want to explain?
      </label>
      <div className="fc-field">
        <textarea
          id="fc-prompt"
          rows={3}
          maxLength={4000}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
          }}
          placeholder="How a payment travels from checkout to the bank and back"
        />
        <button type="submit" className="lp-btn lp-btn-amber" disabled={busy}>
          {busy ? "Opening…" : "Draw my diagram"}
        </button>
      </div>
      <div className="fc-ideas">
        <span id="fc-ideas-label">Or start from</span>
        <ul aria-labelledby="fc-ideas-label">
          {EXAMPLE_PROMPTS.slice(4, 7).map((ex) => (
            <li key={ex.label}>
              <button type="button" onClick={() => setPrompt(ex.prompt)}>
                {ex.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="fc-help">{signedIn ? "Opens a new diagram with your prompt filled in." : "Sign in with Google and your prompt will be waiting for you."}</p>
    </form>
  );
}
