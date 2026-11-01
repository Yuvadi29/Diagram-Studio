import { handler, json, requireApiUser } from "@/lib/api";
import { cloudStatus } from "@/features/ai/services/server";

export const GET = handler(async () => {
  await requireApiUser();
  return json({ cloud: cloudStatus() });
});
