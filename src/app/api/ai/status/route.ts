import { handler, json, requireApiUser } from "@/lib/api";
import { getCloudStatus } from "@/features/ai/services/server";

export const GET = handler(async () => {
  const { supabase, user } = await requireApiUser();
  return json({ cloud: await getCloudStatus(supabase, user.id) });
});
