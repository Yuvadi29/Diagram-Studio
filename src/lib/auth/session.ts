import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/types";

/** For Server Components/pages: returns the user or redirects to /login. */
export async function requireUser(next?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return { supabase, user };
}

export async function getProfile(): Promise<ProfileRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (data) return data as ProfileRow;
  return {
    id: user.id,
    email: user.email ?? null,
    display_name: (user.user_metadata?.display_name as string | undefined) ?? user.email?.split("@")[0] ?? null,
    avatar_url: null,
    preferences: {},
    created_at: user.created_at,
    updated_at: user.created_at,
  };
}
