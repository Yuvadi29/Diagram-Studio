/**
 * Background video render worker (Phase 5).
 *
 * Runs OUTSIDE Next.js (long renders must never run inside an API request):
 *   bun run worker:render
 * It claims queued rows from `exports`, renders them with Remotion, uploads
 * the MP4 to the private `exports` storage bucket and updates job status.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { createAdminClient } from "../../../lib/supabase/admin";
import { buildVideoProps } from "./build-job";

const POLL_MS = Number(process.env.RENDER_WORKER_POLL_MS ?? 5000) || 5000;
const BROWSER = process.env.REMOTION_BROWSER_EXECUTABLE || undefined;
let stopping = false;

type Job = { id: string; user_id: string; project_id: string; presentation_id: string | null; format: "mp4-landscape" | "mp4-portrait" };

const log = (...a: unknown[]) => console.log(`[render-worker ${new Date().toISOString()}]`, ...a);

async function main() {
  const supabase = createAdminClient();

  // Jobs left "rendering" by a crashed worker are failed so users can retry.
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  await supabase
    .from("exports")
    .update({ status: "failed", error_message: "The render worker stopped unexpectedly. Please try again." })
    .eq("status", "rendering")
    .lt("started_at", staleBefore);

  log("Bundling video composition…");
  const serveUrl = await bundle({ entryPoint: path.resolve(process.cwd(), "src/features/exports/remotion/index.ts") });
  log("Ready. Waiting for jobs.");

  while (!stopping) {
    const { data, error } = await supabase.rpc("claim_export_job");
    if (error) {
      log("Failed to poll for jobs:", error.message);
      await new Promise((r) => setTimeout(r, POLL_MS * 2));
      continue;
    }
    const job = (Array.isArray(data) ? data[0] : data) as Job | undefined;
    if (!job) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }
    await processJob(supabase, job, serveUrl);
  }
}

async function processJob(supabase: ReturnType<typeof createAdminClient>, job: Job, serveUrl: string) {
  const started = Date.now();
  log(`Rendering ${job.id} (${job.format})`);
  const outFile = path.join(os.tmpdir(), `diagram-studio-${job.id}.mp4`);
  try {
    if (!job.presentation_id) throw new Error("Export has no presentation.");
    const [{ data: presentation, error: pErr }, { data: diagram, error: dErr }, { data: scenes, error: sErr }] = await Promise.all([
      supabase.from("presentations").select("landscape_config,portrait_config").eq("id", job.presentation_id).single(),
      supabase.from("diagrams").select("id,title,diagram_dsl,excalidraw_data").eq("project_id", job.project_id).order("created_at").limit(1).single(),
      supabase.from("scenes").select("id,title,description,order_index,scene_data").eq("presentation_id", job.presentation_id).order("order_index"),
    ]);
    if (pErr || dErr || sErr || !presentation || !diagram) throw new Error(pErr?.message ?? dErr?.message ?? sErr?.message ?? "Presentation data not found.");

    const inputProps = buildVideoProps({ diagram, presentation, scenes: scenes ?? [] }, job.format === "mp4-portrait" ? "portrait" : "landscape");
    const composition = await selectComposition({ serveUrl, id: "DiagramVideo", inputProps, browserExecutable: BROWSER });

    let lastUpdate = 0;
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outFile,
      inputProps,
      browserExecutable: BROWSER,
      onProgress: ({ progress }) => {
        const now = Date.now();
        if (now - lastUpdate > 1500) {
          lastUpdate = now;
          void supabase.from("exports").update({ progress: Math.min(0.99, progress) }).eq("id", job.id);
        }
      },
    });

    const filePath = `${job.user_id}/${job.id}.mp4`;
    const bytes = await fs.readFile(outFile);
    const { error: upErr } = await supabase.storage.from("exports").upload(filePath, bytes, { contentType: "video/mp4", upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    await supabase.from("exports").update({ status: "completed", progress: 1, file_url: filePath, completed_at: new Date().toISOString(), error_message: null }).eq("id", job.id);
    log(`Finished ${job.id} in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Failed ${job.id}:`, message);
    await supabase.from("exports").update({ status: "failed", error_message: message.slice(0, 500), completed_at: new Date().toISOString() }).eq("id", job.id);
  } finally {
    await fs.rm(outFile, { force: true }).catch(() => undefined);
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    log(`Received ${sig}; finishing the current job, then exiting.`);
    stopping = true;
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
