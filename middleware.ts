import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasClassAccess } from "./app/utils/permissions";
import { readClassClaim, readTeamleaderClaim } from "./app/utils/authClaims";
import type { Database } from "./app/lib/database.types";
import type { AuthError } from "@supabase/supabase-js";
import {
  AUTH_FETCH_TIMEOUT_MS,
  AUTH_GET_USER_TIMEOUT_MS,
  AUTH_PROFILES_TIMEOUT_MS,
  classifyPath,
  createTimeoutFetch,
  isProfilesTimeoutError,
  isTransientAuthError,
  withAuthTimeout,
} from "./app/utils/routeGuard";
import { createPostgrestFetch } from "./app/utils/supabase/postgrestFetch";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Bypass paths that need no auth before the networked getUser(). The exclusion is an allowlist
  // (fail-closed): anything not matched falls through to the auth check.
  const pathClass = classifyPath(pathname);

  if (pathClass.kind === "public_skip" || pathClass.kind === "open") {
    return NextResponse.next();
  }

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value),
          );
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          );
        },
      },
      // Bound each Supabase request (Auth and PostgREST): unreachable Supabase makes auth-js retry
      // ~30s, hitting the Edge 25s limit (504), so fail fast into the 503 path. The outer layer retries
      // only PostgREST `JWT issued at future` with the same token; its total wait (700ms) fits within
      // the profiles outer timeout.
      global: {
        fetch: createPostgrestFetch({
          fetch: createTimeoutFetch(AUTH_FETCH_TIMEOUT_MS),
        }),
      },
    },
  );

  // Non-`res` responses (redirect/new NextResponse) lose the Set-Cookie headers queued on `res`, so
  // copy them. Refresh tokens are rotated (supabase/config.toml); dropping them logs the client out.
  const withCookies = (response: NextResponse) => {
    res.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  };
  const redirectTo = (path: string) =>
    withCookies(NextResponse.redirect(new URL(path, req.url)));
  // Transient Supabase failures return 503 (not "logged out"); Retry-After defers to client retry.
  const serviceUnavailable = (error: unknown) => {
    console.error("Supabase Auth への到達に失敗しました（一時的障害）:", error);
    return withCookies(
      new NextResponse("Service Unavailable", {
        status: 503,
        headers: { "Retry-After": "2" },
      }),
    );
  };

  try {
    // getUser() verifies the token signature with the Auth server; getSession() only echoes the
    // local cookie, so never use it for authentication (forged-cookie bypass).
    // The outer timeout keeps the refresh retry loop under the Edge 25s limit; an overrun becomes
    // AuthRetryableFetchError and is turned into 503 by the catch below.
    const {
      data: { user },
      error: getUserError,
    } = await withAuthTimeout(
      supabase.auth.getUser(),
      AUTH_GET_USER_TIMEOUT_MS,
    );

    if (getUserError && isTransientAuthError(getUserError)) {
      // Network errors/5xx cannot be triggered by an attacker; return 503 instead of redirecting
      // logged-in users to /login. Still fail-closed (not treated as logged out).
      return serviceUnavailable(getUserError);
    }

    switch (pathClass.kind) {
      case "auth_only":
        if (!user) {
          return redirectTo("/login");
        }
        return res;
      case "restricted": {
        if (!user) {
          return redirectTo("/login");
        }
        // getUser() just verified this token's signature, so its user_class claim is trustworthy
        // (tampering would fail verification). getSession() reads the local cookie: no extra round trip.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        // Either claim invalid (hook disabled / old token / profile not yet created) falls back to a profiles query.
        let userClass = readClassClaim(session?.access_token);
        let isTeamleader = readTeamleaderClaim(session?.access_token);

        // The flag only matters for routes that allow teamleader, so skip the DB round trip for the rest.
        if (
          userClass === null ||
          (isTeamleader === null && pathClass.allowed.includes("teamleader"))
        ) {
          // Outer timeout is AUTH_PROFILES_TIMEOUT_MS (inner + 1s) so the inner abort fires first on
          // header hangs; postgrest-js turns it into `{ error }`, hence isProfilesTimeoutError -> 503.
          // A body stall throws into the catch's 503. Other fetch failures redirect to `/`.
          const profileQuery = supabase
            .from("profiles")
            .select("class, is_teamleader")
            .eq("user_id", user.id)
            .single();
          const { data: profile, error: profileError } = await withAuthTimeout(
            Promise.resolve(profileQuery),
            AUTH_PROFILES_TIMEOUT_MS,
          );

          if (profileError) {
            if (isProfilesTimeoutError(profileError)) {
              return serviceUnavailable(profileError);
            }
            console.error("Profile fetch error:", profileError);
          }
          userClass = profile?.class ?? null;
          isTeamleader = profile?.is_teamleader ?? false;
        }

        if (!hasClassAccess(pathClass.allowed, userClass, isTeamleader)) {
          return redirectTo("/");
        }
        return res;
      }
      case "auth_route":
        if (user) {
          return redirectTo("/");
        }
        return res;
      default: {
        pathClass satisfies never;
        return res;
      }
    }
  } catch (error) {
    // withAuthTimeout overruns arrive as throws; treat transient errors as 503, not logged out.
    if (isTransientAuthError(error as AuthError)) {
      return serviceUnavailable(error);
    }
    console.error("Middleware error:", error);
    // Redirecting to /login from /login would loop forever, so render the page.
    if (pathClass.kind === "auth_route") {
      return res;
    }
    return redirectTo("/login");
  }
}

export const config = {
  matcher: [
    // Exclude only Next.js static assets here; other exclusions (extensions, /api) live in code
    // allowlists so unknown paths cannot skip the auth check (fail-closed).
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
