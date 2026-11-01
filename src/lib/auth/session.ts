import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/types";

export interface SessionUser {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
}

/**
 * The signed-in user, or null. Uses getClaims(), which verifies the access
 * token's signature locally (no round trip to Supabase Auth for projects with
 * asymmetric signing keys). Cached per request: the layout, the page and the
 * profile lookup all share one check.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; email?: string; user_metadata?: Record<string, unknown> } | undefined;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: claims.email ?? null, user_metadata: claims.user_metadata ?? {} };
});

/** For Server Components/pages: returns the user or redirects to /login. */
export async function requireUser(next?: string) {
  const [supabase, user] = await Promise.all([createClient(), getSessionUser()]);
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return { supabase, user };
}

function metaString(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export const getProfile = cache(async (): Promise<ProfileRow | null> => {
  const [supabase, user] = await Promise.all([createClient(), getSessionUser()]);
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (data) return data as ProfileRow;
  const now = new Date().toISOString();
  return {
    id: user.id,
    email: user.email,
    display_name: metaString(user.user_metadata, "display_name", "full_name", "name") ?? user.email?.split("@")[0] ?? null,
    avatar_url: metaString(user.user_metadata, "avatar_url", "picture"),
    preferences: {},
    created_at: now,
    updated_at: now,
  };
});
