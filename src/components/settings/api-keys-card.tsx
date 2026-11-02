"use client";
import { useState } from "react";
import { Check, ExternalLink, KeyRound, PlugZap, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api-client";
import type { CloudStatus, GeminiModelOption } from "@/features/ai/services/settings";

/**
 * Settings → API keys. Users store their own provider keys here; the key is
 * verified with the provider, encrypted on the server and never shown again.
 * Built as a list so more providers can be added alongside Gemini.
 */
export function ApiKeysCard({ cloud, onChange }: { cloud: CloudStatus; onChange: (c: CloudStatus) => void }) {
  const [editing, setEditing] = useState(!cloud.hasKey);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const key = value.trim();
    if (!key) return;
    setBusy("save");
    setError(null);
    try {
      // Verify first so a bad key is never stored.
      const { models } = await api.post<{ models: GeminiModelOption[] }>("/api/ai/gemini/models", { apiKey: key });
      const r = await api.put<{ cloud: CloudStatus }>("/api/ai/gemini", { apiKey: key });
      onChange(r.cloud);
      setEditing(false);
      setValue("");
      toast.success("Gemini API key saved", { description: `${models.length} models available. Choose one under AI provider.` });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    try {
      const r = await api.delete<{ cloud: CloudStatus }>("/api/ai/gemini");
      onChange(r.cloud);
      setEditing(true);
      toast.success("Gemini API key removed");
    } catch (err) {
      toast.error("Could not remove the key", { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      {!cloud.storageReady && (
        <p className="flex gap-2 rounded-md border border-destructive/40 p-3 text-xs text-destructive">
          <TriangleAlert className="size-4 shrink-0" /> This server can’t store API keys yet: set API_KEY_ENCRYPTION_SECRET (see README).
        </p>
      )}
      <div className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              Google Gemini
              {cloud.hasKey ? <Badge variant="success">Saved</Badge> : <Badge variant="outline">Not added</Badge>}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Used for cloud diagram generation, edits and scenes.</p>
          </div>
          {cloud.hasKey && !editing && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2.5 py-1 font-mono text-xs">
                <KeyRound className="size-3.5 text-success" /> {cloud.keyHint}
              </span>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Replace
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void remove()} disabled={busy !== null}>
                {busy === "remove" ? <Spinner /> : <Trash2 />} Remove
              </Button>
            </div>
          )}
        </div>
        {editing && (
          <form
            className="mt-4 grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Label htmlFor="api-key-gemini">API key</Label>
            <div className="flex gap-2">
              <Input
                id="api-key-gemini"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                placeholder="Paste your key (starts with AIza…)"
              />
              <Button type="submit" disabled={!value.trim() || busy !== null || !cloud.storageReady}>
                {busy === "save" ? <Spinner /> : <PlugZap />} Verify &amp; save
              </Button>
            </div>
            {error && (
              <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-foreground underline-offset-4 hover:underline">
                Create a free key in Google AI Studio <ExternalLink className="size-3" />
              </a>
              {cloud.hasKey && (
                <>
                  {" · "}
                  <button type="button" className="underline-offset-4 hover:underline" onClick={() => setEditing(false)}>
                    Keep the saved key
                  </button>
                </>
              )}
            </p>
          </form>
        )}
      </div>
      <p className="flex gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0 text-success" /> Keys are verified with the provider, encrypted on our server, and never shown again or sent back to your browser. Usage is billed to your own account.
      </p>
      {cloud.hasKey && !cloud.model && (
        <p className="flex items-center gap-1.5 text-xs text-brand">
          <Check className="size-3.5" /> Key saved. Now choose a model under AI provider.
        </p>
      )}
    </div>
  );
}
