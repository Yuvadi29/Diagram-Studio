import { z } from "zod";
import { handler, json, parseBody, requireApiUser, dbError } from "@/lib/api";
import { listProjects } from "@/lib/data";

export const GET = handler(async (request: Request) => {
  const { supabase } = await requireApiUser();
  const q = new URL(request.url).searchParams.get("q") ?? undefined;
  return json({ projects: await listProjects(supabase, q) });
});

const CreateSchema = z.object({
  title: z.string().trim().max(120).optional(),
  description: z.string().max(1000).optional(),
});

export const POST = handler(async (request: Request) => {
  const { supabase } = await requireApiUser();
  const body = await parseBody(request, CreateSchema, 10_000);
  const { data, error } = await supabase.rpc("create_project", { p_title: body.title || "Untitled diagram", p_description: body.description ?? null });
  dbError(error);
  return json({ id: data as string }, { status: 201 });
});
