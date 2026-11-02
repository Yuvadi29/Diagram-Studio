"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Cloud, Copy, Cpu, ExternalLink, KeyRound, PlugZap, RefreshCw, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
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
import type { AISettings, CloudStatus, GeminiModelOption } from "@/features/ai/services/settings";

export type { CloudStatus };

const AI_STUDIO_URL = "https://aistudio.google.com/apikey";

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
  cloud: initialCloud,
  onSaved,
  compact,
  keySource = "inline",
}: {
  initial: AISettings;
  cloud: CloudStatus;
  onSaved?: (s: AISettings, cloud: CloudStatus) => void;
  compact?: boolean;
  /** "settings": the key is managed in Settings → API keys; this form only picks the model. */
  keySource?: "inline" | "settings";
}) {
  const [settings, setSettings] = useState<AISettings>(initial);
  const [cloud, setCloud] = useState<CloudStatus>(initialCloud);
  const [saving, setSaving] = useState(false);

  // ── Gemini (bring your own key) ──
  const [replacingKey, setReplacingKey] = useState(keySource === "inline" && !initialCloud.hasKey);
  const [newKey, setNewKey] = useState("");
  const [verifiedKey, setVerifiedKey] = useState<string | null>(null);
  const [models, setModels] = useState<GeminiModelOption[] | null>(null);
  const [model, setModel] = useState(initialCloud.model ?? "");
  const [loadingModels, setLoadingModels] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const loadModels = useCallback(async (apiKey?: string) => {
    setLoadingModels(true);
    setKeyError(null);
    try {
      const r = await api.post<{ models: GeminiModelOption[] }>("/api/ai/gemini/models", apiKey ? { apiKey } : {});
      setModels(r.models);
      if (apiKey) setVerifiedKey(apiKey);
      if (!r.models.length) setKeyError("This key works, but no Gemini text models are available to it.");
      return true;
    } catch (err) {
      setModels(null);
      setKeyError(errorMessage(err));
      return false;
    } finally {
      setLoadingModels(false);
    }
  }, []);

  // With a saved key, fetch the model list as soon as Gemini is selected.
  useEffect(() => {
    if (settings.provider === "gemini" && cloud.hasKey && !replacingKey && models === null && !loadingModels && !keyError) void loadModels();
  }, [settings.provider, cloud.hasKey, replacingKey, models, loadingModels, keyError, loadModels]);

  async function removeKey() {
    try {
      const r = await api.delete<{ cloud: CloudStatus }>("/api/ai/gemini");
      setCloud(r.cloud);
      setReplacingKey(true);
      setModels(null);
      setVerifiedKey(null);
      setNewKey("");
      toast.success("Gemini API key removed");
    } catch (err) {
      toast.error("Could not remove the key", { description: errorMessage(err) });
    }
  }

  // ── Ollama ──
  const [testing, setTesting] = useState(false);
  const [conn, setConn] = useState<OllamaConnectionResult | null>(null);
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

  const keyPending = replacingKey && newKey.trim().length > 0 && verifiedKey !== newKey.trim();
  const canSaveGemini = (cloud.hasKey && !replacingKey) || verifiedKey !== null;

  async function save() {
    setSaving(true);
    try {
      let nextCloud = cloud;
      if (settings.provider === "gemini") {
        if (!canSaveGemini) throw new Error(keyPending ? "Click “Verify key” first." : "Add your Gemini API key.");
        if (!model) throw new Error("Choose a Gemini model.");
        const r = await api.put<{ cloud: CloudStatus }>("/api/ai/gemini", { apiKey: replacingKey ? (verifiedKey ?? undefined) : undefined, model });
        nextCloud = r.cloud;
        setCloud(r.cloud);
        setReplacingKey(false);
        setNewKey("");
        setVerifiedKey(null);
        await api.patch("/api/profile", { preferences: { provider: "gemini" } });
      } else {
        await api.patch("/api/profile", { preferences: { provider: "ollama", ollamaUrl: settings.ollamaUrl, ollamaModel: settings.ollamaModel } });
      }
      onSaved?.(settings, nextCloud);
      toast.success("AI settings saved");
    } catch (err) {
      toast.error("Could not save settings", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  const modelInstalled = conn?.ok ? conn.models.some((m) => m.name === settings.ollamaModel || m.name === `${settings.ollamaModel}:latest`) : null;
  const selectedModel = models?.find((m) => m.id === model);

  return (
    <div className="grid gap-5">
      <div className={cn("grid gap-3", !compact && "sm:grid-cols-2")} role="radiogroup" aria-label="AI provider">
        {(
          [
            { id: "gemini", icon: Cloud, title: "Gemini (cloud)", body: cloud.configured ? `Your key ${cloud.keyHint ?? ""} · ${cloud.model}` : "Use your own Google Gemini API key." },
            { id: "ollama", icon: Cpu, title: "Local Ollama", body: "Runs on your own machine. Private and free." },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={settings.provider === opt.id}
            onClick={() => setSettings((s) => ({ ...s, provider: opt.id }))}
            className={cn("flex items-start gap-3 rounded-lg border p-3 text-left transition-colors", settings.provider === opt.id ? "border-brand bg-brand/5" : "hover:border-muted-foreground/40")}
          >
            <opt.icon className={cn("mt-0.5 size-4", settings.provider === opt.id ? "text-brand" : "text-muted-foreground")} />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium">
                {opt.title}
                {opt.id === "gemini" && !cloud.configured && <Badge variant="outline">Needs setup</Badge>}
                {opt.id === "gemini" && cloud.configured && <Badge variant="success">Ready</Badge>}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{opt.body}</span>
            </span>
          </button>
        ))}
      </div>

      {settings.provider === "gemini" && (
        <div className="grid gap-4 rounded-lg border p-4">
          {!cloud.storageReady && (
            <p className="flex gap-2 rounded-md border border-destructive/40 p-3 text-xs text-destructive">
              <TriangleAlert className="size-4 shrink-0" /> This server can’t store API keys yet: the administrator needs to set API_KEY_ENCRYPTION_SECRET (see README).
            </p>
          )}

          {keySource === "settings" ? (
            <div className="grid gap-2">
              <Label>Gemini API key</Label>
              {cloud.hasKey ? (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2.5 py-1 font-mono text-xs">
                    <KeyRound className="size-3.5 text-success" /> {cloud.keyHint}
                  </span>
                  <a href="#api-keys" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    Manage in API keys
                  </a>
                </p>
              ) : (
                <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  Add your Gemini API key under{" "}
                  <a href="#api-keys" className="text-foreground underline underline-offset-4">
                    API keys
                  </a>{" "}
                  first, then choose a model here.
                </p>
              )}
              {keyError && (
                <p className="rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive" role="alert">
                  {keyError}
                </p>
              )}
            </div>
          ) : (
          <div className="grid gap-2">
            <Label htmlFor="gemini-key">Gemini API key</Label>
            {cloud.hasKey && !replacingKey ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 font-mono text-sm">
                  <KeyRound className="size-3.5 text-success" /> Saved {cloud.keyHint}
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => setReplacingKey(true)}>
                  Replace
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => void removeKey()}>
                  <Trash2 /> Remove
                </Button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    id="gemini-key"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={newKey}
                    onChange={(e) => {
                      setNewKey(e.target.value);
                      setKeyError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newKey.trim()) {
                        e.preventDefault();
                        void loadModels(newKey.trim());
                      }
                    }}
                    placeholder="Paste your key (starts with AIza…)"
                  />
                  <Button type="button" variant="outline" onClick={() => void loadModels(newKey.trim())} disabled={!newKey.trim() || loadingModels}>
                    {loadingModels ? <Spinner /> : verifiedKey === newKey.trim() && verifiedKey ? <Check className="text-success" /> : <PlugZap />} Verify key
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Don’t have one?{" "}
                  <a href={AI_STUDIO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-foreground underline-offset-4 hover:underline">
                    Create a free key in Google AI Studio <ExternalLink className="size-3" />
                  </a>
                  {cloud.hasKey && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="underline-offset-4 hover:underline"
                        onClick={() => {
                          setReplacingKey(false);
                          setNewKey("");
                          setVerifiedKey(null);
                          setModels(null);
                          setKeyError(null);
                        }}
                      >
                        Keep the saved key
                      </button>
                    </>
                  )}
                </p>
              </>
            )}
            {keyError && (
              <p className="rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive" role="alert">
                {keyError}
              </p>
            )}
          </div>
          )}

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="gemini-model">Model</Label>
              {models && (
                <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => void loadModels(replacingKey ? verifiedKey ?? undefined : undefined)}>
                  <RefreshCw className="size-3" /> Refresh
                </button>
              )}
            </div>
            {models && models.length > 0 ? (
              <>
                <NativeSelect id="gemini-model" value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="" disabled>
                    Choose a model…
                  </option>
                  {model && !models.some((m) => m.id === model) && <option value={model}>{model} (not available for this key)</option>}
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} ({m.id})
                    </option>
                  ))}
                </NativeSelect>
                {selectedModel?.description && <p className="line-clamp-2 text-xs text-muted-foreground">{selectedModel.description}</p>}
                <p className="text-xs text-muted-foreground">Flash models are fast and cheap, and work well for diagrams. Pro models are slower but stronger on complex systems.</p>
              </>
            ) : (
              <p className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                {loadingModels ? (
                  <>
                    <Spinner className="size-3" /> Loading the models available to your key…
                  </>
                ) : cloud.hasKey && !replacingKey ? (
                  "Couldn’t load models for the saved key."
                ) : keySource === "settings" ? (
                  "Models appear here once your key is saved."
                ) : (
                  "Verify your key to see the models you can use."
                )}
              </p>
            )}
          </div>

          <p className="flex gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-success" />
            Your key is encrypted on our server and never shown again or sent to your browser. Gemini usage is billed to your own Google account.
          </p>
        </div>
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
            <div className={cn("rounded-md border p-3 text-xs", conn.ok ? "border-success/40 text-success" : "border-destructive/40 text-destructive")} role="status">
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
            {conn?.ok && conn.models.length === 0 && (
              <p className="text-xs text-destructive">
                No models installed. Run <code className="font-mono">ollama pull llama3.1</code>.
              </p>
            )}
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
        <Button type="button" onClick={() => void save()} disabled={saving || (settings.provider === "gemini" && (!canSaveGemini || !model))}>
          {saving && <Spinner />} Save AI settings
        </Button>
      </div>
    </div>
  );
}
