"use client";
import { useEffect, useState } from "react";
import { Check, Cloud, Copy, Cpu, PlugZap, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { OllamaClient, type OllamaConnectionResult } from "@/features/ai/providers/ollama";
import type { AISettings } from "@/features/ai/services/settings";

export interface CloudStatus {
  configured: boolean;
  model: string;
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/60 px-3 py-2 font-mono text-xs">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap scroll-thin">{command}</code>
      <button
        type="button"
        aria-label="Copy command"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => {
          void navigator.clipboard.writeText(command).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

export function ProviderSettingsForm({
  initial,
  cloud,
  onSaved,
  compact,
}: {
  initial: AISettings;
  cloud: CloudStatus | null;
  onSaved?: (s: AISettings) => void;
  compact?: boolean;
}) {
  const [settings, setSettings] = useState<AISettings>(initial);
  const [testing, setTesting] = useState(false);
  const [conn, setConn] = useState<OllamaConnectionResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState("https://your-app.example.com");
  useEffect(() => setOrigin(window.location.origin), []);

  async function test() {
    setTesting(true);
    const r = await OllamaClient.testConnection(settings.ollamaUrl);
    setConn(r);
    setTesting(false);
    if (r.ok && r.models.length && !r.models.some((m) => m.name === settings.ollamaModel || m.name === `${settings.ollamaModel}:latest`)) {
      setSettings((s) => ({ ...s, ollamaModel: r.models[0].name }));
    }
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch("/api/profile", { preferences: settings });
      onSaved?.(settings);
      toast.success("AI settings saved");
    } catch (err) {
      toast.error("Could not save settings", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  const modelInstalled = conn?.ok ? conn.models.some((m) => m.name === settings.ollamaModel || m.name === `${settings.ollamaModel}:latest`) : null;

  return (
    <div className="grid gap-5">
      <div className={cn("grid gap-3", !compact && "sm:grid-cols-2")} role="radiogroup" aria-label="AI provider">
        {(
          [
            { id: "gemini", icon: Cloud, title: "Cloud AI", body: cloud ? `Gemini (${cloud.model}). Runs on our servers.` : "Gemini, runs on our servers." },
            { id: "ollama", icon: Cpu, title: "Local Ollama", body: "Runs on your own machine. Private and free." },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={settings.provider === opt.id}
            onClick={() => setSettings((s) => ({ ...s, provider: opt.id }))}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
              settings.provider === opt.id ? "border-primary bg-primary/5" : "hover:border-muted-foreground/40",
            )}
          >
            <opt.icon className={cn("mt-0.5 size-4", settings.provider === opt.id ? "text-primary" : "text-muted-foreground")} />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium">
                {opt.title}
                {opt.id === "gemini" && cloud && !cloud.configured && <Badge variant="destructive">Not configured</Badge>}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{opt.body}</span>
            </span>
          </button>
        ))}
      </div>

      {settings.provider === "gemini" && cloud && !cloud.configured && (
        <p className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <TriangleAlert className="size-4 shrink-0" /> Cloud AI isn’t available on this deployment (no GEMINI_API_KEY). Use local Ollama, or ask the administrator to configure it.
        </p>
      )}

      {settings.provider === "ollama" && (
        <div className="grid gap-4 rounded-lg border p-4">
          <div className="grid gap-2">
            <Label htmlFor="ollama-url">Ollama endpoint</Label>
            <div className="flex gap-2">
              <Input id="ollama-url" value={settings.ollamaUrl} onChange={(e) => setSettings((s) => ({ ...s, ollamaUrl: e.target.value }))} placeholder="http://localhost:11434" />
              <Button type="button" variant="outline" onClick={() => void test()} disabled={testing}>
                {testing ? <Spinner /> : <PlugZap />} Test
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Your browser connects to Ollama directly. “localhost” means your computer, not our server.</p>
          </div>

          {conn && (
            <div className={cn("rounded-md border p-3 text-xs", conn.ok ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive")} role="status">
              {conn.ok ? `Connected to Ollama ${conn.version ?? ""}: ${conn.models.length} model${conn.models.length === 1 ? "" : "s"} installed.` : conn.error}
            </div>
          )}

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="ollama-model">Model</Label>
              {conn?.ok && (
                <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => void test()}>
                  <RefreshCw className="size-3" /> Refresh
                </button>
              )}
            </div>
            {conn?.ok && conn.models.length > 0 ? (
              <NativeSelect id="ollama-model" value={settings.ollamaModel} onChange={(e) => setSettings((s) => ({ ...s, ollamaModel: e.target.value }))}>
                {!conn.models.some((m) => m.name === settings.ollamaModel) && <option value={settings.ollamaModel}>{settings.ollamaModel} (not installed)</option>}
                {conn.models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                    {m.parameterSize ? ` · ${m.parameterSize}` : ""}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <Input id="ollama-model" value={settings.ollamaModel} onChange={(e) => setSettings((s) => ({ ...s, ollamaModel: e.target.value }))} placeholder="llama3.1" />
            )}
            {modelInstalled === false && (
              <p className="text-xs text-destructive">
                This model isn’t installed. Run <code className="font-mono">ollama pull {settings.ollamaModel}</code>.
              </p>
            )}
            {conn?.ok && conn.models.length === 0 && <p className="text-xs text-destructive">No models installed. Run <code className="font-mono">ollama pull llama3.1</code>.</p>}
          </div>

          <details className="group text-xs text-muted-foreground" open={conn ? !conn.ok : false}>
            <summary className="cursor-pointer select-none font-medium text-foreground">Setup instructions</summary>
            <ol className="mt-3 grid list-decimal gap-3 pl-4">
              <li>
                Install Ollama from <span className="text-foreground">ollama.com</span> and pull a model with good JSON output (e.g. llama3.1, qwen2.5):
                <div className="mt-1.5">
                  <CopyCommand command="ollama pull llama3.1" />
                </div>
              </li>
              <li>
                Allow this site to call Ollama from your browser. macOS app:
                <div className="mt-1.5 grid gap-1.5">
                  <CopyCommand command={`launchctl setenv OLLAMA_ORIGINS "${origin}"`} />
                  <span>then quit and reopen Ollama. Linux/Windows or the CLI:</span>
                  <CopyCommand command={`OLLAMA_ORIGINS="${origin}" ollama serve`} />
                </div>
              </li>
              <li>Click Test above. If it still fails, check that nothing (VPN, browser privacy settings) blocks requests to localhost.</li>
            </ol>
          </details>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving && <Spinner />} Save AI settings
        </Button>
      </div>
    </div>
  );
}
