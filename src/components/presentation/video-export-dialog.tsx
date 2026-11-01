"use client";
import { useCallback, useEffect, useState } from "react";
import { Download, Film, RectangleHorizontal, RectangleVertical, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/utils/format";
import type { ExportRow } from "@/lib/supabase/types";
import type { PresentationFormat } from "@/features/presentations";

type ExportItem = ExportRow & { download_url: string | null };

const STATUS: Record<ExportRow["status"], { label: string; variant: "default" | "secondary" | "success" | "destructive" | "outline" }> = {
  queued: { label: "Queued", variant: "secondary" },
  rendering: { label: "Rendering", variant: "default" },
  completed: { label: "Ready", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export function VideoExportDialog({
  open,
  onOpenChange,
  presentationId,
  defaultFormat,
  beforeQueue,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  presentationId: string;
  defaultFormat: PresentationFormat;
  /** Flush unsaved scene edits before rendering. */
  beforeQueue: () => Promise<void>;
}) {
  const [format, setFormat] = useState<PresentationFormat>(defaultFormat);
  const [items, setItems] = useState<ExportItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ exports: ExportItem[] }>(`/api/exports?presentationId=${presentationId}`);
      setItems(r.exports);
    } catch (err) {
      toast.error("Could not load exports", { description: errorMessage(err) });
    }
  }, [presentationId]);

  useEffect(() => {
    if (open) {
      setFormat(defaultFormat);
      void load();
    }
  }, [open, defaultFormat, load]);

  const active = items?.some((i) => i.status === "queued" || i.status === "rendering");
  useEffect(() => {
    if (!open || !active) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [open, active, load]);

  async function queue() {
    setBusy(true);
    try {
      await beforeQueue();
      await api.post("/api/exports", { presentationId, format: format === "portrait" ? "mp4-portrait" : "mp4-landscape" });
      await load();
      toast.success("Video queued", { description: "It will render in the background." });
    } catch (err) {
      toast.error("Could not queue the video", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: ExportItem) {
    try {
      await api.delete(`/api/exports/${item.id}`);
      await load();
    } catch (err) {
      toast.error("Could not update export", { description: errorMessage(err) });
    }
  }

  const stale = items?.some((i) => i.status === "queued" && Date.now() - new Date(i.created_at).getTime() > 120_000);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="size-4" /> Export MP4 video
          </DialogTitle>
          <DialogDescription>Renders your scenes, transitions and reveal animations into a video, in the background.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Video format">
          {(
            [
              { f: "landscape", icon: RectangleHorizontal, label: "16:9 · 1920×1080", sub: "YouTube, courses" },
              { f: "portrait", icon: RectangleVertical, label: "9:16 · 1080×1920", sub: "Shorts, Reels" },
            ] as const
          ).map((o) => (
            <button
              key={o.f}
              role="radio"
              aria-checked={format === o.f}
              onClick={() => setFormat(o.f)}
              className={cn("flex items-start gap-2 rounded-lg border p-3 text-left", format === o.f ? "border-primary bg-primary/5" : "hover:border-muted-foreground/40")}
            >
              <o.icon className="mt-0.5 size-4" />
              <span>
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="text-xs text-muted-foreground">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <Button onClick={() => void queue()} disabled={busy}>
          {busy ? <Spinner /> : <Film />} Render video
        </Button>
        <div className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">Recent renders</p>
          {items === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading…
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No videos yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {items.map((i) => (
                <li key={i.id} className="grid gap-1.5 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{i.format === "mp4-portrait" ? "9:16" : "16:9"}</span>
                    <Badge variant={STATUS[i.status].variant}>
                      {i.status === "rendering" && <Spinner className="size-3" />}
                      {STATUS[i.status].label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{relativeTime(i.created_at)}</span>
                    <span className="ml-auto flex gap-1">
                      {i.download_url && (
                        <Button size="sm" variant="secondary" asChild>
                          <a href={i.download_url} download>
                            <Download /> Download
                          </a>
                        </Button>
                      )}
                      {i.status === "queued" && (
                        <Button size="icon-sm" variant="ghost" onClick={() => void remove(i)} aria-label="Cancel">
                          <X />
                        </Button>
                      )}
                      {(i.status === "completed" || i.status === "failed" || i.status === "cancelled") && (
                        <Button size="icon-sm" variant="ghost" onClick={() => void remove(i)} aria-label="Remove">
                          <Trash2 />
                        </Button>
                      )}
                    </span>
                  </div>
                  {i.status === "rendering" && (
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(i.progress * 100)}%` }} />
                    </div>
                  )}
                  {i.status === "failed" && i.error_message && <p className="text-xs text-destructive">{i.error_message}</p>}
                </li>
              ))}
            </ul>
          )}
          {stale && <p className="text-xs text-muted-foreground">Still queued? Video rendering needs the background worker to be running (<code className="font-mono">bun run worker:render</code>, see README).</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
