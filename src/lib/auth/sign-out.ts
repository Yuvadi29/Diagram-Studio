"use client";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign out everywhere this browser knows about: clear the Supabase session
 * client-side, clear the server cookies, then do a full page load so no
 * signed-in UI survives in the router cache.
 */
export async function signOut(redirectTo = "/") {
  try {
    await createClient().auth.signOut();
  } catch {
    /* fall through to the server route */
  }
  try {
    await fetch("/auth/signout", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" } });
  } catch {
    /* network error: the client session is already gone */
  }
  window.location.assign(redirectTo);
}
