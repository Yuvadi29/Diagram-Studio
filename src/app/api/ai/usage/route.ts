import { z } from "zod";
import { handler, json, parseBody, requireApiUser } from "@/lib/api";
import { logUsage } from "@/features/ai/services/server";

/** Usage reports for local (Ollama) inference, which runs in the browser. */
const Schema = z.object({
  provider: z.literal("ollama"),
  model: z.string().trim().min(1).max(200),
  operation: z.enum(["generate", "refine", "scenes"]),
  inputTokens: z.number().int().min(0).max(10_000_000).optional(),
  outputTokens: z.number().int().min(0).max(10_000_000).optional(),
  status: z.enum(["success", "error"]),
  errorCode: z.string().max(40).optional(),
});

export const POST = handler(async (request: Request) => {
  const { supabase, user } = await requireApiUser();
  const b = await parseBody(request, Schema, 5_000);
  await logUsage(supabase, {
    userId: user.id,
    provider: "ollama",
    model: b.model,
    operation: b.operation,
    usage: { inputTokens: b.inputTokens, outputTokens: b.outputTokens },
    status: b.status,
    errorCode: b.errorCode,
  });
  return json({ ok: true });
});

export const GET = handler(async () => {
  const { supabase, user } = await requireApiUser();
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { data } = await supabase
    .from("ai_usage")
    .select("provider,operation,status,input_tokens,output_tokens,created_at")
    .eq("user_id", user.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = data ?? [];
  const summary = { requests: rows.length, inputTokens: 0, outputTokens: 0, byProvider: { gemini: 0, ollama: 0 } as Record<string, number> };
  for (const r of rows) {
    summary.inputTokens += r.input_tokens ?? 0;
    summary.outputTokens += r.output_tokens ?? 0;
    summary.byProvider[r.provider] = (summary.byProvider[r.provider] ?? 0) + 1;
  }
  return json({ summary });
});
