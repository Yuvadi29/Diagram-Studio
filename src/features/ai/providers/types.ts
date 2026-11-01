import type { DiagramContext, DiagramDSL } from "../../diagrams/schema/dsl";
import type { PresentationScene } from "../../presentations/scenes/schema";

export type AIProviderId = "ollama" | "gemini";

export type AIErrorCode =
  | "NOT_CONFIGURED"
  | "CONNECTION_FAILED"
  | "MODEL_UNAVAILABLE"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "INVALID_OUTPUT"
  | "PROVIDER_ERROR"
  | "BAD_REQUEST"
  | "CANCELLED";

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  constructor(code: AIErrorCode, message: string, opts: { retryable?: boolean; status?: number; cause?: unknown } = {}) {
    super(message);
    this.name = "AIError";
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.status = opts.status;
    if (opts.cause) (this as { cause?: unknown }).cause = opts.cause;
  }
}

export const AI_ERROR_HTTP_STATUS: Record<AIErrorCode, number> = {
  NOT_CONFIGURED: 503,
  CONNECTION_FAILED: 502,
  MODEL_UNAVAILABLE: 502,
  TIMEOUT: 504,
  RATE_LIMITED: 429,
  INVALID_OUTPUT: 422,
  PROVIDER_ERROR: 502,
  BAD_REQUEST: 400,
  CANCELLED: 499,
};

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LLMRequest {
  system: string;
  prompt: string;
  /** JSON schema describing the expected output (structured output). */
  schema: Record<string, unknown>;
  temperature?: number;
  signal?: AbortSignal;
}

export interface LLMResponse {
  text: string;
  usage: TokenUsage;
  model: string;
}

/** Minimal transport every provider implements; prompts and validation live in the orchestrator. */
export interface LLMClient {
  readonly provider: AIProviderId;
  readonly model: string;
  completeJSON(req: LLMRequest): Promise<LLMResponse>;
}

export interface GenerateOptions extends DiagramContext {
  /** Id assigned to the generated diagram. */
  diagramId?: string;
  signal?: AbortSignal;
}

export interface RefineContext {
  selectedNodeIds?: string[];
  history?: { role: "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
}

export type RefinementResult =
  | { kind: "patch"; diagram: DiagramDSL; summary: string; skipped: string[]; layoutChanged: boolean; warnings: string[] }
  | { kind: "clarify"; question: string }
  | { kind: "explain"; answer: string };

export interface AIResult<T> {
  value: T;
  warnings: string[];
  usage: TokenUsage;
  model: string;
  provider: AIProviderId;
}

/**
 * The provider-agnostic AI interface used by the rest of the app.
 * Both the in-browser Ollama provider and the server-side Gemini provider
 * implement it through the same orchestrator.
 */
export interface AIProvider {
  readonly id: AIProviderId;
  generateDiagram(prompt: string, context?: GenerateOptions): Promise<AIResult<DiagramDSL>>;
  refineDiagram(diagram: DiagramDSL, instruction: string, context?: RefineContext): Promise<AIResult<RefinementResult>>;
  generateScenes(diagram: DiagramDSL, opts?: { signal?: AbortSignal; guidance?: string }): Promise<AIResult<PresentationScene[]>>;
}
