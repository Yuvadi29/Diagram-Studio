"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api-client";
import type { ProjectRow } from "@/lib/supabase/types";
import { EXAMPLE_PROMPTS } from "@/features/diagrams/services/examples";
import { NewDiagramDialog } from "./new-diagram-dialog";
import { ProjectCard } from "./project-card";

export function ProjectBrowser({ initialProjects, mode }: { initialProjects: ProjectRow[]; mode: "dashboard" | "all" | "recent" }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<ProjectRow | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [deleting, setDeleting] = useState<ProjectRow | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? projects.filter((p) => p.title.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)) : projects;
    return mode === "recent" ? list.slice(0, 12) : list;
  }, [projects, query, mode]);

  async function duplicate(p: ProjectRow) {
    const t = toast.loading(`Duplicating “${p.title}”…`);
    try {
      await api.post<{ id: string }>(`/api/projects/${p.id}/duplicate`);
      const { projects: fresh } = await api.get<{ projects: ProjectRow[] }>("/api/projects");
      setProjects(fresh);
      toast.success("Project duplicated", { id: t });
    } catch (err) {
      toast.error("Could not duplicate", { id: t, description: errorMessage(err) });
    }
  }

  async function rename() {
    if (!renaming || !newTitle.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/api/projects/${renaming.id}`, { title: newTitle.trim() });
      setProjects((ps) => ps.map((p) => (p.id === renaming.id ? { ...p, title: newTitle.trim(), updated_at: new Date().toISOString() } : p)));
      setRenaming(null);
      toast.success("Renamed");
    } catch (err) {
      toast.error("Could not rename", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/projects/${deleting.id}`);
      setProjects((ps) => ps.filter((p) => p.id !== deleting.id));
      toast.success(`Deleted “${deleting.title}”`);
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error("Could not delete", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "dashboard" ? "Dashboard" : mode === "recent" ? "Recent projects" : "My diagrams";
  const recent = projects.slice(0, 4);
  const grid = (list: ProjectRow[]) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {list.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          onRename={() => {
            setRenaming(p);
            setNewTitle(p.title);
          }}
          onDuplicate={() => void duplicate(p)}
          onDelete={() => setDeleting(p)}
        />
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:px-12 sm:py-12">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{heading}</h1>
          <p className="mt-1 text-gray-600 sm:text-lg dark:text-gray-300">
            {projects.length === 0 ? (
              <>
                Describe a system and <span className="ds-highlight">watch it draw</span>.
              </>
            ) : (
              <>
                {projects.length} diagram{projects.length === 1 ? "" : "s"}, ready to <span className="ds-highlight">edit or present</span>.
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {projects.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects" className="pl-8" aria-label="Search projects" />
            </div>
          )}
          <NewDiagramDialog>
            <Button variant="solid" className="shrink-0">
              <Plus /> <span className="hidden sm:inline">Create new diagram</span>
              <span className="sm:hidden">New</span>
            </Button>
          </NewDiagramDialog>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="card-chai px-6 py-14 text-center">
          <Sparkles className="mx-auto size-8 text-brand" />
          <h2 className="mt-4 text-xl font-medium">Start by describing the diagram you want to create.</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Diagram Studio generates an editable Excalidraw diagram you can refine and turn into a presentation.</p>
          <div className="mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">
            {EXAMPLE_PROMPTS.slice(0, 4).map((ex) => (
              <NewDiagramDialog key={ex.label} initialPrompt={{ prompt: ex.prompt, type: ex.type }}>
                <button className="card-chai cursor-pointer px-4 py-3 text-left text-sm transition-colors hover:text-brand">{ex.label}</button>
              </NewDiagramDialog>
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No projects match “{query}”.</p>
      ) : mode === "dashboard" && !query ? (
        <div className="grid gap-10">
          <section>
            <h2 className="mb-4 text-lg font-medium">Recent</h2>
            {grid(recent)}
          </section>
          {projects.length > 4 && (
            <section>
              <h2 className="mb-4 text-lg font-medium">All projects</h2>
              {grid(projects)}
            </section>
          )}
        </div>
      ) : (
        grid(filtered)
      )}

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void rename();
            }}
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="rename">Title</Label>
              <Input id="rename" autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={120} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !newTitle.trim()}>
                {busy && <Spinner />} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the diagram, its version history and its presentation. This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
            >
              {busy && <Spinner />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
