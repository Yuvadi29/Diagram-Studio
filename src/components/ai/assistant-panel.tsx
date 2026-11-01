"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Check, ChevronDown, Cloud, Cpu, Minus, Pencil, Plus, RotateCcw, Settings2, Sparkles, Square, TriangleAlert, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DIAGRAM_TYPE_LABELS, DIAGRAM_TYPES, type DiagramDSL, type DiagramType } from "@/features/diagrams/schema/dsl";
import { diffDiagrams, summarizeDiff, type DiagramDiff } from "@/features/diagrams/services/diff";
import { EXAMPLE_PROMPTS } from "@/features/diagrams/services/examples";
import { describeAIError } from "@/features/ai/services/client-provider";
import { PROVIDER_LABELS, type AISettings } from "@/features/ai/services/settings";
import type { RefinementResult } from "@/features/ai/providers/types";

export interface UndoHandle {
  id: string;
}

type Msg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; kind: "text"; text: string; tone?: "question" | "info" }
  | {
      id: string;
      role: "assistant";
      kind: "preview";
      summary: string;
      diff: DiagramDiff;
      next: DiagramDSL;
      layoutChanged: boolean;
      warnings: string[];
      status: "pending" | "applying" | "applied" | "discarded" | "undone";
      undo?: UndoHandle;
    }
  | { id: string; role: "assistant"; kind: "generated"; text: string; warnings: string[]; undo?: UndoHandle; status: "applied" | "undone" }
  | { id: string; role: "assistant"; kind: "error"; title: string; text: string; code?: string; retry: () => void };

let seq = 0;
const mid = () => `m${++seq}-${Date.now().toString(36)}`;

export interface AssistantPanelProps {
  diagram: DiagramDSL;
  settings: AISettings;
  cloudConfigured: boolean | null;
  selectedNodeIds: string[];
  onProviderChange: (provider: AISettings["provider"]) => void;
  onOpenSettings: () => void;
  generate: (prompt: string, type: DiagramType | "auto", signal: AbortSignal, overrideProvider?: AISettings["provider"]) => Promise<{ summary: string; warnings: string[]; undo: UndoHandle }>;
  refine: (instruction: string, history: { role: "user" | "assistant"; content: string }[], signal: AbortSignal, overrideProvider?: AISettings["provider"]) => Promise<{ result: RefinementResult; warnings: string[] }>;
  applyPatch: (next: DiagramDSL, summary: string, layoutChanged: boolean) => Promise<UndoHandle>;
  undo: (handle: UndoHandle, summary: string) => Promise<void>;
  pendingPrompt?: { prompt: string; type: DiagramType | "auto" } | null;
  onPendingConsumed?: () => void;
  /** Prompts sent from elsewhere in the editor (e.g. "Explain this" in the inspector). */
  externalPrompt?: { text: string; nonce: number } | null;
}

export function AssistantPanel(props: AssistantPanelProps) {
  const { diagram, settings, selectedNodeIds } = props;
  const isEmpty = diagram.nodes.length === 0;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [type, setType] = useState<DiagramType | "auto">("auto");
  const [busy, setBusy] = useState<string | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const consumedRef = useRef(false);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const push = (m: Msg) => setMessages((ms) => [...ms, m]);
  const update = (id: string, patch: Partial<Msg>) => setMessages((ms) => ms.map((m) => (m.id === id ? ({ ...m, ...patch } as Msg) : m)));

  const history = () =>
    messages
      .filter((m) => m.role === "user" || (m.role === "assistant" && (m.kind === "text" || m.kind === "preview")))
      .slice(-6)
      .map((m) => (m.role === "user" ? { role: "user" as const, content: m.text } : { role: "assistant" as const, content: m.kind === "text" ? m.text : (m as { summary: string }).summary }));

  async function runGenerate(prompt: string, t: DiagramType | "auto", override?: AISettings["provider"]) {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(isEmpty ? "Generating your diagram…" : "Generating a new diagram…");
    try {
      const r = await props.generate(prompt, t, ctrl.signal, override);
      push({ id: mid(), role: "assistant", kind: "generated", text: r.summary, warnings: r.warnings, undo: r.undo, status: "applied" });
      setReplaceMode(false);
    } catch (err) {
      const e = describeAIError(err);
      if (e.code === "CANCELLED") push({ id: mid(), role: "assistant", kind: "text", text: "Cancelled.", tone: "info" });
      else push({ id: mid(), role: "assistant", kind: "error", title: e.title, text: e.message, code: e.code, retry: () => void runGenerate(prompt, t, override) });
    } finally {
      setBusy(null);
      abortRef.current = null;
    }
  }

  async function runRefine(instruction: string, override?: AISettings["provider"]) {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy("Thinking…");
    const before = diagram;
    try {
      const { result, warnings } = await props.refine(instruction, history(), ctrl.signal, override);
      if (result.kind === "clarify") push({ id: mid(), role: "assistant", kind: "text", text: result.question, tone: "question" });
      else if (result.kind === "explain") push({ id: mid(), role: "assistant", kind: "text", text: result.answer });
      else {
        const diff = diffDiagrams(before, result.diagram);
        push({ id: mid(), role: "assistant", kind: "preview", summary: result.summary || summarizeDiff(diff), diff, next: result.diagram, layoutChanged: result.layoutChanged, warnings, status: "pending" });
      }
    } catch (err) {
      const e = describeAIError(err);
      if (e.code === "CANCELLED") push({ id: mid(), role: "assistant", kind: "text", text: "Cancelled.", tone: "info" });
      else push({ id: mid(), role: "assistant", kind: "error", title: e.title, text: e.message, code: e.code, retry: () => void runRefine(instruction, override) });
    } finally {
      setBusy(null);
      abortRef.current = null;
    }
  }

  function send(text = input) {
    const t = text.trim();
    if (!t || busy) return;
    push({ id: mid(), role: "user", text: t });
    setInput("");
    if (isEmpty || replaceMode) void runGenerate(t, type);
    else void runRefine(t);
  }

  // Auto-run the prompt entered in the "New diagram" dialog.
  useEffect(() => {
    if (props.pendingPrompt && !consumedRef.current && isEmpty) {
      consumedRef.current = true;
      props.onPendingConsumed?.();
      setType(props.pendingPrompt.type);
      push({ id: mid(), role: "user", text: props.pendingPrompt.prompt });
      void runGenerate(props.pendingPrompt.prompt, props.pendingPrompt.type);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.pendingPrompt]);

  useEffect(() => {
    if (props.externalPrompt) send(props.externalPrompt.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.externalPrompt?.nonce]);

  async function apply(m: Extract<Msg, { kind: "preview" }>) {
    update(m.id, { status: "applying" });
    try {
      const undo = await props.applyPatch(m.next, m.summary, m.layoutChanged);
      update(m.id, { status: "applied", undo });
    } catch (err) {
      update(m.id, { status: "pending" });
      push({ id: mid(), role: "assistant", kind: "error", title: "Could not apply the change", text: describeAIError(err).message, retry: () => void apply(m) });
    }
  }

  async function undo(m: Extract<Msg, { kind: "preview" | "generated" }>) {
    if (!m.undo) return;
    await props.undo(m.undo, m.kind === "preview" ? m.summary : "AI generation");
    update(m.id, { status: "undone" });
  }

  const suggestions = (() => {
    if (isEmpty) return [];
    const has = (t: string) => diagram.nodes.some((n) => n.type === t);
    const list: string[] = [];
    if (selectedNodeIds.length) list.push("Explain the selected component");
    if (!has("cache") && (has("database") || has("service"))) list.push("Add a Redis cache in front of the database");
    if (!has("queue") && diagram.type === "architecture") list.push("Add a message queue for async work");
    list.push(diagram.layout === "top-to-bottom" ? "Change to a horizontal layout" : "Change to a vertical layout");
    if (diagram.nodes.length > 8) list.push("Simplify this diagram");
    if (!diagram.nodes.some((n) => /auth/i.test(n.label))) list.push("Add an authentication service");
    return list.slice(0, 4);
  })();

  const ProviderIcon = settings.provider === "ollama" ? Cpu : Cloud;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4 text-primary" /> AI assistant
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground" aria-label="Choose AI provider">
            <ProviderIcon className="size-3.5" />
            {settings.provider === "ollama" ? settings.ollamaModel || "Ollama" : "Cloud"}
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>AI provider</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={settings.provider} onValueChange={(v) => props.onProviderChange(v as AISettings["provider"])}>
              <DropdownMenuRadioItem value="gemini">
                {PROVIDER_LABELS.gemini}
                {props.cloudConfigured === false && <span className="ml-auto text-[10px] text-destructive">not configured</span>}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="ollama">{PROVIDER_LABELS.ollama}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={props.onOpenSettings}>
              <Settings2 /> Provider settings…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 scroll-thin" aria-live="polite">
        {messages.length === 0 && (
          <div className="rounded-lg border border-dashed p-4 text-sm">
            {isEmpty ? (
              <>
                <p className="font-medium">Start by describing the diagram you want to create.</p>
                <div className="mt-3 grid gap-1.5">
                  {EXAMPLE_PROMPTS.slice(0, 4).map((ex) => (
                    <button
                      key={ex.label}
                      className="rounded-md border px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                      onClick={() => {
                        setType(ex.type);
                        send(ex.prompt);
                      }}
                      disabled={!!busy}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Ask for changes in plain language, e.g. “Add Redis between the API and the database” or “Highlight the API gateway”. Changes are previewed before they’re applied.</p>
            )}
          </div>
        )}

        {messages.map((m) => {
          if (m.role === "user")
            return (
              <div key={m.id} className="ml-6 rounded-lg bg-secondary px-3 py-2 text-sm whitespace-pre-wrap">
                {m.text}
              </div>
            );
          if (m.kind === "text")
            return (
              <div key={m.id} className={cn("mr-4 text-sm whitespace-pre-wrap", m.tone === "info" && "text-muted-foreground", m.tone === "question" && "rounded-lg border border-primary/30 bg-primary/5 p-3")}>
                {m.text}
              </div>
            );
          if (m.kind === "error")
            return (
              <div key={m.id} className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm" role="alert">
                <p className="flex items-center gap-1.5 font-medium text-destructive">
                  <TriangleAlert className="size-4" /> {m.title}
                </p>
                <p className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">{m.text}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={m.retry}>
                    <RotateCcw /> Retry
                  </Button>
                  {(m.code === "CONNECTION_FAILED" || m.code === "MODEL_UNAVAILABLE" || m.code === "NOT_CONFIGURED") && (
                    <Button size="sm" variant="outline" onClick={props.onOpenSettings}>
                      <Settings2 /> Settings
                    </Button>
                  )}
                  {settings.provider === "ollama" && props.cloudConfigured && (
                    <Button size="sm" variant="ghost" onClick={() => props.onProviderChange("gemini")}>
                      <Cloud /> Switch to cloud AI
                    </Button>
                  )}
                </div>
              </div>
            );
          if (m.kind === "generated")
            return (
              <div key={m.id} className="rounded-lg border bg-card p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium">
                  <Check className="size-4 text-success" /> {m.status === "undone" ? "Generation undone" : m.text}
                </p>
                {m.warnings.length > 0 && <Warnings items={m.warnings} />}
                {m.undo && m.status === "applied" && (
                  <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={() => void undo(m)}>
                    <Undo2 /> Undo
                  </Button>
                )}
              </div>
            );
          // preview
          return (
            <div key={m.id} className="rounded-lg border bg-card p-3 text-sm">
              <p className="font-medium">{m.summary}</p>
              <DiffList diff={m.diff} />
              {m.warnings.length > 0 && <Warnings items={m.warnings} />}
              <div className="mt-3 flex gap-1.5">
                {m.status === "pending" && (
                  <>
                    <Button size="sm" onClick={() => void apply(m)}>
                      <Check /> Apply
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => update(m.id, { status: "discarded" })}>
                      <X /> Discard
                    </Button>
                  </>
                )}
                {m.status === "applying" && (
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Spinner /> Applying…
                  </span>
                )}
                {m.status === "applied" && (
                  <>
                    <span className="flex items-center gap-1 text-xs text-success">
                      <Check className="size-3.5" /> Applied
                    </span>
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void undo(m)}>
                      <Undo2 /> Undo
                    </Button>
                  </>
                )}
                {m.status === "discarded" && <span className="text-xs text-muted-foreground">Discarded</span>}
                {m.status === "undone" && <span className="text-xs text-muted-foreground">Undone</span>}
              </div>
            </div>
          );
        })}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="text-primary" />
            <span className="ds-pulse">{busy}</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => abortRef.current?.abort()}>
              <Square /> Stop
            </Button>
          </div>
        )}
      </div>

      <div className="border-t p-3">
        {!isEmpty && suggestions.length > 0 && !busy && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} onClick={() => send(s)} className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
                {s}
              </button>
            ))}
          </div>
        )}
        {(isEmpty || replaceMode) && (
          <div className="mb-2 flex items-center gap-2">
            <NativeSelect value={type} onChange={(e) => setType(e.target.value as DiagramType | "auto")} className="flex-1" aria-label="Diagram type">
              <option value="auto">Any diagram type</option>
              {DIAGRAM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DIAGRAM_TYPE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
            {replaceMode && (
              <Button size="sm" variant="ghost" onClick={() => setReplaceMode(false)}>
                Cancel
              </Button>
            )}
          </div>
        )}
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={3}
            maxLength={4000}
            placeholder={isEmpty ? "Describe the diagram you want…" : replaceMode ? "Describe a new diagram (replaces the current one)…" : "Ask AI to modify the diagram…"}
            className="resize-none pr-11"
            disabled={!!busy}
            aria-label="Message the AI assistant"
          />
          <Button size="icon-sm" className="absolute right-2 bottom-2" onClick={() => send()} disabled={!input.trim() || !!busy} aria-label="Send">
            <ArrowUp />
          </Button>
        </div>
        {!isEmpty && !replaceMode && (
          <button className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setReplaceMode(true)}>
            <Pencil className="size-3" /> Generate a new diagram from scratch instead
          </button>
        )}
        {settings.provider === "gemini" && props.cloudConfigured === false && (
          <p className="mt-2 text-xs text-destructive">
            Cloud AI isn’t configured on this server.{" "}
            <button className="underline" onClick={() => props.onProviderChange("ollama")}>
              Use local Ollama
            </button>{" "}
            or <Link href="/settings#ai" className="underline">open settings</Link>.
          </p>
        )}
      </div>
    </div>
  );
}

function Warnings({ items }: { items: string[] }) {
  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">
        {items.length} automatic fix{items.length === 1 ? "" : "es"} applied
      </summary>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {items.slice(0, 8).map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </details>
  );
}

function DiffList({ diff }: { diff: DiagramDiff }) {
  const rows: { icon: typeof Plus; cls: string; text: string }[] = [
    ...diff.addedNodes.map((n) => ({ icon: Plus, cls: "text-success", text: n.label })),
    ...diff.removedNodes.map((n) => ({ icon: Minus, cls: "text-destructive", text: n.label })),
    ...diff.updatedNodes.map((u) => ({ icon: Pencil, cls: "text-primary", text: `${u.after.label} (${u.fields.join(", ")})` })),
    ...diff.addedEdges.map((e) => ({ icon: Plus, cls: "text-success", text: `${e.source} → ${e.target}${e.label ? `: ${e.label}` : ""}` })),
    ...diff.removedEdges.map((e) => ({ icon: Minus, cls: "text-destructive", text: `${e.source} → ${e.target}` })),
    ...diff.updatedEdges.map((u) => ({ icon: Pencil, cls: "text-primary", text: `${u.after.source} → ${u.after.target} (${u.fields.join(", ")})` })),
  ];
  if (diff.layoutChanged) rows.push({ icon: Pencil, cls: "text-primary", text: "Layout direction (diagram will be re-arranged)" });
  if (diff.groupsChanged) rows.push({ icon: Pencil, cls: "text-primary", text: "Groups" });
  if (!rows.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs">
      {rows.slice(0, 12).map((r, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <r.icon className={cn("size-3.5 shrink-0", r.cls)} />
          <span className="truncate">{r.text}</span>
        </li>
      ))}
      {rows.length > 12 && <li className="text-muted-foreground">+{rows.length - 12} more</li>}
    </ul>
  );
}
