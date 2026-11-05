import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

const PROTECTED = [
  "/dashboard",
  "/projects",
  "/settings",
  "/editor",
  "/presentation",
];
const AUTH_PAGES = ["/login", "/signup"];

/** Refreshes the auth session cookie and guards private routes. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) return response;

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims(). getClaims()
  // refreshes an expired session (writing new cookies) and verifies the token
  // locally, so this adds no round trip to Supabase Auth on most requests.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (user && AUTH_PAGES.includes(path)) {
    const url = request.nextUrl.clone();

    // If in production, force the canonical production host for redirecting
    if (
      process.env.NODE_ENV === "production" &&
      process.env.NEXT_PUBLIC_SUPABASE_URL
    ) {
      const productionUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "") + "/dashboard";
      return NextResponse.redirect(new URL(productionUrl, request.url));
    }

    // Otherwise (local or non-prod), use the current request URL
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
