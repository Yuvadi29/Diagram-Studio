import "server-only";
import type { ServerSupabase } from "@/lib/api";
import type { ExportRow } from "@/lib/supabase/types";

export async function withSignedUrls(supabase: ServerSupabase, rows: ExportRow[]) {
  return Promise.all(
    rows.map(async (r) => {
      if (r.status !== "completed" || !r.file_url) return { ...r, download_url: null as string | null };
      const { data } = await supabase.storage.from("exports").createSignedUrl(r.file_url, 3600, { download: true });
      return { ...r, download_url: data?.signedUrl ?? null };
    }),
  );
}
