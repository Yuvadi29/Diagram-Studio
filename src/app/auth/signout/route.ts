import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Clears the session cookies. JSON for fetch() callers, a redirect for plain form posts. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  if (request.headers.get("accept")?.includes("application/json")) {
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
