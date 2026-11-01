"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api-client";
import { DIAGRAM_TYPE_LABELS, DIAGRAM_TYPES, type DiagramType } from "@/features/diagrams/schema/dsl";
import { EXAMPLE_PROMPTS, PENDING_PROMPT_KEY } from "@/features/diagrams/services/examples";

export function NewDiagramDialog({ children, initialPrompt }: { children: React.ReactNode; initialPrompt?: { prompt: string; type: DiagramType | "auto" } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState(initialPrompt?.prompt ?? "");
  const [type, setType] = useState<DiagramType | "auto">(initialPrompt?.type ?? "auto");
  const [busy, setBusy] = useState<"ai" | "blank" | null>(null);

  async function create(withAI: boolean) {
    setBusy(withAI ? "ai" : "blank");
    try {
      const derivedTitle = title.trim() || (withAI ? prompt.trim().replace(/^(explain|show|create|visualize|visualise)\s+(how\s+)?/i, "").slice(0, 60) : "") || "Untitled diagram";
      const { id } = await api.post<{ id: string }>("/api/projects", { title: derivedTitle.charAt(0).toUpperCase() + derivedTitle.slice(1) });
      if (withAI && prompt.trim()) {
        try {
          sessionStorage.setItem(PENDING_PROMPT_KEY(id), JSON.stringify({ prompt: prompt.trim(), type }));
        } catch {
          /* ignore */
        }
      }
      setOpen(false);
      router.push(`/editor/${id}`);
    } catch (err) {
      toast.error("Could not create the diagram", { description: errorMessage(err) });
      setBusy(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setBusy(null);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New diagram</DialogTitle>
          <DialogDescription>Start by describing the diagram you want to create.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (prompt.trim().length >= 3) void create(true);
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="nd-prompt">What do you want to explain?</Label>
            <Textarea
              id="nd-prompt"
              autoFocus
              rows={4}
              maxLength={4000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Explain how a request flows from the browser through an API gateway to a service and PostgreSQL"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && prompt.trim().length >= 3) void create(true);
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_PROMPTS.slice(0, 4).map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => {
                    setPrompt(ex.prompt);
                    setType(ex.type);
                  }}
                  className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="nd-title">Title (optional)</Label>
              <Input id="nd-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Derived from your prompt" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nd-type">Diagram type</Label>
              <NativeSelect id="nd-type" value={type} onChange={(e) => setType(e.target.value as DiagramType | "auto")}>
                <option value="auto">Let AI decide</option>
                {DIAGRAM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DIAGRAM_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void create(false)}>
              {busy === "blank" ? <Spinner /> : <Square />} Blank canvas
            </Button>
            <Button type="submit" disabled={busy !== null || prompt.trim().length < 3}>
              {busy === "ai" ? <Spinner /> : <Sparkles />} Generate diagram
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
