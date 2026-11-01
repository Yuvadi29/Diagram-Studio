"use client";
import { useEffect, useState } from "react";
import { History, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api-client";
import { relativeTime } from "@/lib/utils/format";
import type { DiagramRow } from "@/lib/supabase/types";

interface VersionItem {
  id: string;
  version_number: number;
  change_description: string | null;
  created_at: string;
}

export function VersionsDialog({
  open,
  onOpenChange,
  diagramId,
  onSaveVersion,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  diagramId: string;
  onSaveVersion: (description: string) => Promise<void>;
  onRestored: (diagram: DiagramRow) => void;
}) {
  const [versions, setVersions] = useState<VersionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const r = await api.get<{ versions: VersionItem[] }>(`/api/diagrams/${diagramId}/versions`);
      setVersions(r.versions);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    setBusy("save");
    try {
      await onSaveVersion(desc.trim() || "Saved version");
      setDesc("");
      await load();
      toast.success("Version saved");
    } catch (err) {
      toast.error("Could not save version", { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function restore(v: VersionItem) {
    setBusy(v.id);
    try {
      const r = await api.post<{ diagram: DiagramRow }>(`/api/diagrams/${diagramId}/versions/${v.id}/restore`);
      onRestored(r.diagram);
      toast.success(`Restored version ${v.version_number}`, { description: "Your previous state is kept in the history." });
      onOpenChange(false);
    } catch (err) {
      toast.error("Could not restore", { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" /> Version history
          </DialogTitle>
          <DialogDescription>Every AI change creates a version. Restoring never deletes history.</DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe this version (optional)" maxLength={200} />
          <Button type="submit" variant="secondary" disabled={busy !== null}>
            {busy === "save" ? <Spinner /> : <Save />} Save
          </Button>
        </form>
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border scroll-thin">
          {error ? (
            <p className="p-4 text-sm text-destructive">{error}</p>
          ) : versions === null ? (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Spinner /> Loading…
            </p>
          ) : versions.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No versions yet. They’re created when AI changes the diagram or when you save one.</p>
          ) : (
            <ul className="divide-y">
              {versions.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-9 shrink-0 font-mono text-xs text-muted-foreground">v{v.version_number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{v.change_description ?? "Untitled version"}</span>
                    <span className="text-xs text-muted-foreground">{relativeTime(v.created_at)}</span>
                  </span>
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void restore(v)}>
                    {busy === v.id ? <Spinner /> : <RotateCcw />} Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
