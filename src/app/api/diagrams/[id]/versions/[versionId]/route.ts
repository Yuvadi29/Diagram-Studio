import { assertUuid, dbError, handler, json, requireApiUser } from "@/lib/api";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

export const GET = handler(async (_request: Request, { params }: Ctx) => {
  const { id, versionId } = await params;
  assertUuid(id, "diagram id");
  assertUuid(versionId, "version id");
  const { supabase } = await requireApiUser();
  const { data, error } = await supabase.from("diagram_versions").select("*").eq("id", versionId).eq("diagram_id", id).single();
  dbError(error, "Version not found.");
  return json({ version: data });
});
