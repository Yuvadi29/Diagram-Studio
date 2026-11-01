/** Public (browser-safe) configuration. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  // New Supabase projects issue a publishable key (sb_publishable_…); older ones an anon key. Either works.
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ollamaDefaultUrl: process.env.NEXT_PUBLIC_OLLAMA_DEFAULT_URL ?? "http://localhost:11434",
  ollamaDefaultModel: process.env.NEXT_PUBLIC_OLLAMA_DEFAULT_MODEL ?? "llama3.1",
};

export function assertSupabaseConfigured() {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
  }
}

/** Project ref from a hosted Supabase URL (https://<ref>.supabase.co), for dashboard links. */
export function supabaseProjectRef(): string | null {
  const m = publicEnv.supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : null;
}
