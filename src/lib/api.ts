import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  console.error("[api] unexpected error", err);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, { status: 500 });
}

/** Authenticate an API request. RLS is still enforced by Postgres on every query. */
export async function requireApiUser(): Promise<{ supabase: ServerSupabase; user: User }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, "UNAUTHORIZED", "You must be signed in.");
  return { supabase, user };
}

/** Parse and validate a JSON body with a size limit. */
export async function parseBody<T extends z.ZodType>(request: Request, schema: T, maxBytes = 1_000_000): Promise<z.infer<T>> {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new ApiError(413, "PAYLOAD_TOO_LARGE", `Request body exceeds ${Math.round(maxBytes / 1024)} KB.`);
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError(413, "PAYLOAD_TOO_LARGE", `Request body exceeds ${Math.round(maxBytes / 1024)} KB.`);
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_FAILED", "Invalid request.", parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return parsed.data;
}

export const uuidSchema = z.string().uuid();

export function assertUuid(id: string, what = "id") {
  if (!uuidSchema.safeParse(id).success) throw new ApiError(400, "INVALID_ID", `Invalid ${what}.`);
}

/** Wrap a route handler with consistent error handling. */
export function handler<Ctx>(fn: (request: Request, ctx: Ctx) => Promise<Response>) {
  return async (request: Request, ctx: Ctx) => {
    try {
      return await fn(request, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Error codes meaning the database schema hasn't been created (migrations not run). */
const SETUP_ERROR_CODES = new Set(["PGRST205", "PGRST202", "42P01", "42883", "3F000"]);

export function isSetupError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return SETUP_ERROR_CODES.has(error.code ?? "") || /schema cache|does not exist/i.test(error.message ?? "") && /table|function|relation/i.test(error.message ?? "");
}

export const SETUP_REQUIRED_MESSAGE =
  "The database isn't set up yet. Run supabase/setup.sql in your Supabase project's SQL Editor, then reload.";

export function dbError(error: { message: string; code?: string } | null, notFoundMessage = "Not found.") {
  if (!error) return;
  if (isSetupError(error)) throw new ApiError(503, "SETUP_REQUIRED", SETUP_REQUIRED_MESSAGE, error.message);
  if (error.code === "PGRST116") throw new ApiError(404, "NOT_FOUND", notFoundMessage);
  if (error.code === "42501") throw new ApiError(403, "FORBIDDEN", "You do not have access to this resource.");
  if (error.code === "P0002") throw new ApiError(404, "NOT_FOUND", notFoundMessage);
  throw new ApiError(500, "DB_ERROR", "A database error occurred.", process.env.NODE_ENV === "development" ? error.message : undefined);
}
