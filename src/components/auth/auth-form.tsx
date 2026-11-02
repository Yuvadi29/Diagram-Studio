"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Sign in / sign up with Google (Supabase OAuth). Both pages use the same flow. */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const params = useSearchParams();
  const next = (() => {
    const n = params.get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
  })();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") ? "Google sign-in didn’t complete. Please try again." : null,
  );

  async function continueWithGoogle() {
    setError(null);
    setLoading(true);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    // On success the browser is already on its way to Google.
    if (error) {
      setLoading(false);
      setError(/provider is not enabled|unsupported provider/i.test(error.message) ? "Google sign-in isn’t enabled for this site yet. Enable the Google provider in Supabase (see README)." : error.message);
    }
  }

  return (
    <div className="card-chai p-7 sm:opacity-100">
      <h1 className="text-2xl font-medium tracking-tight">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            Log in and pick up <span className="ds-highlight">where you left off</span>.
          </>
        ) : (
          <>
            Start turning ideas into <span className="ds-highlight">visual stories</span>.
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => void continueWithGoogle()}
        disabled={loading}
        className="btn-asym mt-6 flex h-11 w-full cursor-pointer items-center justify-center gap-3 border border-neutral-200 bg-white text-sm font-medium text-[#1f1f1f] transition-colors duration-200 hover:bg-neutral-200 disabled:opacity-60"
      >
        {loading ? <Spinner className="text-[#1f1f1f]" /> : <GoogleMark />} Continue with Google
      </button>
      {error && (
        <p role="alert" className="mt-4 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="mt-4 text-center text-xs text-muted-foreground">We use your Google name, email and profile picture to set up your account.</p>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href={`/signup${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-foreground underline-offset-4 transition-colors hover:text-brand hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-foreground underline-offset-4 transition-colors hover:text-brand hover:underline">
              Log in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
