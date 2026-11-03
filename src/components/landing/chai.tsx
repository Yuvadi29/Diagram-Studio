"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/shared/logo";

/**
 * ChaiUI building blocks for the landing page (ui.chaicode.com), written as
 * plain markup + the scoped `.chai` stylesheet so they don't touch the app's
 * own theme tokens.
 */

/** Pale-cream Montserrat phrase. One per paragraph. */
export function Highlight({ children }: { children: React.ReactNode }) {
  return <span className="c-highlight">{children}</span>;
}

/** Hero pill with an orange glint running round its 1px border. */
export function AnimatedBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="c-badge">
      <span className="c-badge-glint" aria-hidden />
      <span className="c-badge-inner">{children}</span>
    </span>
  );
}

export function ArrowUpRight() {
  return (
    <svg viewBox="0 0 24 24" className="c-icon" aria-hidden>
      <path d="M7 17 17 7M7 7h10v10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronsDown() {
  return (
    <svg viewBox="0 0 24 24" className="c-icon" aria-hidden>
      <path d="m7 6 5 5 5-5M7 13l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="c-wordmark">
      <LogoMark className="c-logo" />
      FlowDeck
    </span>
  );
}

/** Half-shaded circle with one label for both themes. Same setting as the app's theme toggle. */
export function ThemeSwitcher() {
  function toggle() {
    const c = document.documentElement.classList;
    const next = c.contains("light") ? "dark" : "light";
    c.toggle("light", next === "light");
    c.toggle("dark", next === "dark");
    try {
      localStorage.setItem("ds-theme", next);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("ds-theme", { detail: next }));
  }
  return (
    <button type="button" className="c-icon-btn" aria-label="Switch theme" onClick={toggle}>
      <svg viewBox="0 0 24 24" className="c-icon" aria-hidden>
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
      </svg>
    </button>
  );
}

/** Sticky transparent header that blurs once the page scrolls. */
export function Navbar({ signedIn, primary }: { signedIn: boolean; primary: { href: string; label: string } }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className="c-nav" data-scrolled={scrolled || undefined}>
      <div className="c-nav-inner">
        <Link href="/" aria-label="FlowDeck home" className="c-nav-home">
          <Wordmark />
        </Link>
        <nav aria-label="Page sections" className="c-nav-links">
          <a href="#how">How it works</a>
          <a href="#formats">Formats</a>
          <a href="#features">Features</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="c-nav-actions">
          <ThemeSwitcher />
          {!signedIn && (
            <Link href="/login" className="c-btn c-btn-ghost c-btn-md c-nav-login">
              Log in
            </Link>
          )}
          <Link href={primary.href} className="c-btn c-btn-outline c-btn-md">
            {signedIn ? "Open app" : "Get started"}
          </Link>
        </div>
      </div>
    </header>
  );
}

/** 30px section heading with a grey subtitle carrying one highlight. */
export function SectionHead({ id, title, children }: { id: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="c-section-head">
      <h2 id={id}>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}
