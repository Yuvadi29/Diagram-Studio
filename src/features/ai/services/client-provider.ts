"use client";
import { api, ApiClientError } from "@/lib/api-client";
import type { DiagramDSL } from "@/features/diagrams/schema/dsl";
import type { PresentationScene } from "@/features/presentations/scenes/schema";
import { createDiagramAI } from "../orchestrator/diagram-ai";
import { OllamaClient } from "../providers/ollama";
import { AIError, type AIErrorCode, type AIProvider, type AIResult, type RefinementResult } from "../providers/types";
import type { AISettings } from "./settings";

function fromApiError(err: unknown): never {
  if (err instanceof ApiClientError) {
    const known: AIErrorCode[] = ["NOT_CONFIGURED", "CONNECTION_FAILED", "MODEL_UNAVAILABLE", "TIMEOUT", "RATE_LIMITED", "INVALID_OUTPUT", "PROVIDER_ERROR", "BAD_REQUEST"];
    const code = (known as string[]).includes(err.code) ? (err.code as AIErrorCode) : err.status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR";
    throw new AIError(code, err.message, { status: err.status });
  }
  throw err;
}

/** Cloud provider: calls this app's API routes; Gemini runs server-side. */
function cloudProvider(): AIProvider {
  return {
    id: "gemini",
    async generateDiagram(prompt, ctx = {}) {
      try {
        const r = await api.post<{ diagram: DiagramDSL; warnings: string[]; model: string }>(
          "/api/ai/generate",
          { prompt, diagramId: ctx.diagramId, diagramType: ctx.diagramType, layout: ctx.layout, history: ctx.history },
          ctx.signal,
        );
        return { value: r.diagram, warnings: r.warnings, usage: {}, model: r.model, provider: "gemini" };
      } catch (e) {
        fromApiError(e);
      }
    },
    async refineDiagram(diagram, instruction, ctx = {}) {
      try {
        const r = await api.post<{ result: RefinementResult; warnings: string[]; model: string }>(
          "/api/ai/refine",
          { diagram, instruction, selectedNodeIds: ctx.selectedNodeIds, history: ctx.history },
          ctx.signal,
        );
        return { value: r.result, warnings: r.warnings, usage: {}, model: r.model, provider: "gemini" };
      } catch (e) {
        fromApiError(e);
      }
    },
    async generateScenes(diagram, opts = {}) {
      try {
        const r = await api.post<{ scenes: PresentationScene[]; warnings: string[]; model: string }>("/api/ai/scenes", { diagram, guidance: opts.guidance }, opts.signal);
        return { value: r.scenes, warnings: r.warnings, usage: {}, model: r.model, provider: "gemini" };
      } catch (e) {
        fromApiError(e);
      }
    },
  };
}

/** Local provider: runs the orchestrator in the browser against the user's Ollama. */
function ollamaProvider(settings: AISettings): AIProvider {
  const client = new OllamaClient({ endpoint: settings.ollamaUrl, model: settings.ollamaModel });
  const inner = createDiagramAI(client);
  const report = (operation: "generate" | "refine" | "scenes", status: "success" | "error", r?: AIResult<unknown>, code?: string) => {
    void api
      .post("/api/ai/usage", {
        provider: "ollama",
        model: r?.model ?? settings.ollamaModel,
        operation,
        inputTokens: r?.usage.inputTokens,
        outputTokens: r?.usage.outputTokens,
        status,
        errorCode: code,
      })
      .catch(() => undefined);
  };
  const wrap = <A extends unknown[], R extends AIResult<unknown>>(op: "generate" | "refine" | "scenes", fn: (...a: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        const r = await fn(...args);
        report(op, "success", r);
        return r;
      } catch (err) {
        report(op, "error", undefined, err instanceof AIError ? err.code : "UNKNOWN");
        throw err;
      }
    };
  return {
    id: "ollama",
    generateDiagram: wrap("generate", inner.generateDiagram),
    refineDiagram: wrap("refine", inner.refineDiagram),
    generateScenes: wrap("scenes", inner.generateScenes),
  };
}

/**
 * The provider the user selected. There is deliberately NO automatic fallback
 * from local to cloud: switching providers is always an explicit user action.
 */
export function createClientAIProvider(settings: AISettings): AIProvider {
  return settings.provider === "ollama" ? ollamaProvider(settings) : cloudProvider();
}

export function describeAIError(err: unknown): { title: string; message: string; code?: AIErrorCode } {
  if (err instanceof AIError) {
    const titles: Partial<Record<AIErrorCode, string>> = {
      CONNECTION_FAILED: "Can't reach the AI provider",
      MODEL_UNAVAILABLE: "Model not available",
      TIMEOUT: "The AI took too long",
      RATE_LIMITED: "Rate limit reached",
      INVALID_OUTPUT: "The AI returned an invalid result",
      NOT_CONFIGURED: "AI provider not configured",
      CANCELLED: "Cancelled",
    };
    return { title: titles[err.code] ?? "AI request failed", message: err.message, code: err.code };
  }
  if ((err as Error)?.name === "AbortError") return { title: "Cancelled", message: "The request was cancelled.", code: "CANCELLED" };
  return { title: "AI request failed", message: err instanceof Error ? err.message : String(err) };
}
