import { buildRepairPrompt } from "../prompts";
import { AIError, type LLMClient, type TokenUsage } from "../providers/types";

export type ParseOutcome<T> =
  | { ok: true; value: T; warnings: string[]; /** Repairable problems worth one more attempt. */ soft?: string[] }
  | { ok: false; errors: string[] };

/** Extract a JSON value from model text (tolerates code fences and prose). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  throw new Error("Response was not valid JSON");
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: (a.inputTokens ?? 0) + (b.inputTokens ?? 0) || undefined,
    outputTokens: (a.outputTokens ?? 0) + (b.outputTokens ?? 0) || undefined,
  };
}

export interface StructuredResult<T> {
  value: T;
  warnings: string[];
  usage: TokenUsage;
  model: string;
}

/**
 * Call the model, parse JSON, validate, and (once) ask the model to repair
 * invalid output by feeding back the exact validation errors.
 */
export async function runStructured<T>(opts: {
  llm: LLMClient;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  parse: (raw: unknown) => ParseOutcome<T>;
  maxRepairs?: number;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<StructuredResult<T>> {
  const maxRepairs = opts.maxRepairs ?? 1;
  let usage: TokenUsage = {};
  let model = opts.llm.model;
  let prompt = opts.prompt;
  let fallback: StructuredResult<T> | null = null;
  let lastErrors: string[] = [];

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const res = await opts.llm.completeJSON({ system: opts.system, prompt, schema: opts.schema, temperature: opts.temperature, signal: opts.signal });
    usage = addUsage(usage, res.usage);
    model = res.model;
    let raw: unknown;
    try {
      raw = extractJson(res.text);
    } catch {
      lastErrors = ["The response was not valid JSON."];
      prompt = buildRepairPrompt(opts.prompt, res.text, lastErrors);
      continue;
    }
    const outcome = opts.parse(raw);
    if (outcome.ok) {
      const result = { value: outcome.value, warnings: outcome.warnings, usage, model };
      if (outcome.soft?.length && attempt < maxRepairs) {
        fallback = result;
        lastErrors = outcome.soft;
        prompt = buildRepairPrompt(opts.prompt, res.text, outcome.soft);
        continue;
      }
      return { ...result, usage };
    }
    lastErrors = outcome.errors;
    prompt = buildRepairPrompt(opts.prompt, res.text, outcome.errors);
  }
  if (fallback) return { ...fallback, usage };
  throw new AIError("INVALID_OUTPUT", `The AI returned an invalid result: ${lastErrors.slice(0, 3).join("; ")}`);
}
