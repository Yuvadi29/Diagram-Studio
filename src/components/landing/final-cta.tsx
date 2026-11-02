"use client";
import { useId, useState } from "react";
import { EXAMPLE_PROMPTS, LANDING_PROMPT_KEY } from "@/features/diagrams/services/examples";
import { ArrowUpRight } from "./chai";

/**
 * ChaiUI closing panel (inverted colours, faint grain, one button), with the
 * product's first step built in: the prompt typed here is waiting in the
 * new-diagram dialog after Google sign-in.
 */
export function FinalCta({ signedIn }: { signedIn: boolean }) {
  const id = useId();
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
    <section className="c-cta" aria-labelledby={`${id}-h`}>
      <svg className="c-cta-grain" aria-hidden>
        <filter id={`${id}-n`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${id}-n)`} />
      </svg>
      <form className="c-cta-inner" onSubmit={submit}>
        <h2 id={`${id}-h`}>What do you want to explain?</h2>
        <p className="c-cta-tagline">{signedIn ? "Write it here and a new diagram opens with your prompt filled in." : "Write it here, sign in with Google, and your prompt will be waiting."}</p>
        <div className="c-cta-field">
          <label htmlFor={`${id}-p`} className="c-sr">
            Describe your diagram
          </label>
          <textarea
            id={`${id}-p`}
            rows={2}
            maxLength={4000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
            }}
            placeholder="How a payment travels from checkout to the bank and back"
          />
          <button type="submit" className="c-btn c-cta-btn" disabled={busy}>
            {busy ? "Opening" : "Draw my diagram"}
            <ArrowUpRight />
          </button>
        </div>
        <div className="c-cta-ideas">
          {EXAMPLE_PROMPTS.slice(4, 7).map((ex) => (
            <button key={ex.label} type="button" onClick={() => setPrompt(ex.prompt)}>
              {ex.label}
            </button>
          ))}
        </div>
      </form>
    </section>
  );
}
