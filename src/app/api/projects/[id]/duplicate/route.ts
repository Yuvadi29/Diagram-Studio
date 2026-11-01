import { assertUuid, dbError, handler, json, requireApiUser } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (_request: Request, { params }: Ctx) => {
  const { id } = await params;
  assertUuid(id, "project id");
  const { supabase } = await requireApiUser();
  const { data, error } = await supabase.rpc("duplicate_project", { p_project_id: id });
  dbError(error, "Project not found.");
  return json({ id: data as string }, { status: 201 });
});
