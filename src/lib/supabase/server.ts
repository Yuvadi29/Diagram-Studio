import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { assertSupabaseConfigured, publicEnv } from "@/lib/env";

/**
 * Supabase client bound to the current user's session (cookies).
 * All queries run with the user's JWT, so Row Level Security applies.
 * Cached per request, so layouts and pages share one client.
 */
export const createClient = cache(async () => {
  assertSupabaseConfigured();
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy refreshes sessions instead.
        }
      },
    },
  });
});
