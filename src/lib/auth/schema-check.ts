import "server-only";
import { isSetupError, type ServerSupabase } from "@/lib/api";

let verified = false;

/**
 * Returns an error message if the database schema is missing, otherwise null.
 * Cached per server process once the schema has been seen, so it costs one
 * lightweight query only until setup is complete.
 */
export async function checkSchema(supabase: ServerSupabase): Promise<string | null> {
  if (verified) return null;
  const { error } = await supabase.from("projects").select("id", { head: true, count: "exact" }).limit(1);
  if (!error) {
    verified = true;
    return null;
  }
  return isSetupError(error) ? error.message : null;
}
