import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS. ONLY for the background render worker,
 * which runs outside Next.js. Never import from app code.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required for the render worker.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
