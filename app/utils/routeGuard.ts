import {
  AuthRetryableFetchError,
  isAuthApiError,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js";
import type { AuthError } from "@supabase/supabase-js";
import {
  ROUTE_PERMISSIONS,
  isAuthOnlyPath,
  matchesRoute,
  type Role,
} from "./permissions";

export { matchesRoute };

const PUBLIC_FILE_PATTERN = /\.(js|css|ico|png|jpg|jpeg|svg|gif)$/;

// auth-js only wraps fetch failures and 502/503/504 in AuthRetryableFetchError; 500/501 become
// AuthApiError. Treat every 5xx as transient. Forged/expired tokens yield 401/403, so they never match.
export const isTransientAuthError = (error: AuthError) =>
  isAuthRetryableFetchError(error) ||
  (isAuthApiError(error) && error.status >= 500);

// If the inner createTimeoutFetch fires first, postgrest-js swallows the abort and returns
// `{ error: { message: "TimeoutError: ..." } }` instead of throwing, so it must be detected here.
// A body stall after headers arrive is instead caught by the outer timer's throw (also 503).
// Ordering invariant: the inner timer only fires first because AUTH_PROFILES_TIMEOUT_MS is inner + margin.
// `Promise.resolve(thenable)` starts the fetch (and registers the inner timer) in a later microtask,
// while withAuthTimeout registers the outer timer synchronously, so equal delays would fire outer first.
export const isProfilesTimeoutError = (
  error:
    | { message?: unknown; name?: unknown; code?: unknown }
    | null
    | undefined,
): boolean => {
  if (!error) return false;
  const message = typeof error.message === "string" ? error.message : "";
  const name = typeof error.name === "string" ? error.name : "";
  return (
    name === "TimeoutError" ||
    name === "AbortError" ||
    message.startsWith("TimeoutError:") ||
    message.startsWith("AbortError:") ||
    message.includes("timed out after")
  );
};

// Per-request timeout. @supabase/ssr injects `global.fetch` into both auth-js and PostgREST, so this
// also covers the profiles query until headers arrive. Aborts are wrapped by auth-js `_handleRequest`
// into AuthRetryableFetchError (status 0; verified on auth-js 2.65.1, recheck on upgrade), which
// isTransientAuthError already catches.
export const AUTH_FETCH_TIMEOUT_MS = 5000;

// Overall cap for getUser(): the refresh retry loop otherwise runs ~30s. Time budget:
// getUser() 6s + profiles 6s = ~12s, well under the Vercel Edge 25s limit. Keep this budget when
// changing constants (tests/utils/routeGuard.test.ts checks the sum).
export const AUTH_GET_USER_TIMEOUT_MS = 6000;

// Overall cap for the profiles query. Must exceed AUTH_FETCH_TIMEOUT_MS so the inner abort fires
// first (see isProfilesTimeoutError); a body stall is cut by the outer throw.
export const AUTH_PROFILES_TIMEOUT_MS = AUTH_FETCH_TIMEOUT_MS + 1000;

/**
 * Edge-safe timeout fetch: uses AbortController + setTimeout only (no AbortSignal.timeout/any) and
 * aborts on whichever of the caller's signal or the timeout fires first.
 */
export const createTimeoutFetch = (
  timeoutMs: number = AUTH_FETCH_TIMEOUT_MS,
  baseFetch: typeof fetch = fetch,
): typeof fetch =>
  ((input, init) => {
    const incomingSignal = init?.signal;
    if (incomingSignal?.aborted) {
      return baseFetch(input, init);
    }
    const controller = new AbortController();
    const timeoutError = () => {
      const error = new Error(
        `Supabase Auth request timed out after ${timeoutMs}ms`,
      );
      error.name = "TimeoutError";
      return error;
    };
    const timer = setTimeout(() => controller.abort(timeoutError()), timeoutMs);
    const onIncomingAbort = () => controller.abort(incomingSignal?.reason);
    incomingSignal?.addEventListener("abort", onIncomingAbort, {
      once: true,
    });
    const cleanup = () => {
      clearTimeout(timer);
      incomingSignal?.removeEventListener("abort", onIncomingAbort);
    };
    return baseFetch(input, { ...init, signal: controller.signal }).then(
      (response) => {
        cleanup();
        return response;
      },
      (error) => {
        cleanup();
        throw error;
      },
    );
  }) as typeof fetch;

/**
 * Caps the wait via Promise.race; it does not cancel the inner retry loop (discarded when the 503
 * ends the Edge invocation). Rejects with AuthRetryableFetchError (status 0), so callers reuse the
 * isTransientAuthError -> 503 path.
 */
export const withAuthTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number = AUTH_GET_USER_TIMEOUT_MS,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new AuthRetryableFetchError(
          `Supabase Auth request timed out after ${timeoutMs}ms`,
          0,
        ),
      );
    }, timeoutMs);
  });
  const settle = (settled: Promise<T>) =>
    settled.then(
      (value) => {
        clearTimeout(timer);
        return value;
      },
      (error) => {
        clearTimeout(timer);
        throw error;
      },
    );
  return Promise.race([settle(promise), timeout]);
};

export const isPublicSkipPath = (pathname: string) =>
  PUBLIC_FILE_PATTERN.test(pathname) ||
  pathname.startsWith("/_next") ||
  pathname.startsWith("/api") ||
  pathname.startsWith("/auth/");

export const isAuthRoute = (pathname: string) => pathname.startsWith("/login");

const findRestrictedRoute = (pathname: string) =>
  Object.entries(ROUTE_PERMISSIONS).find(([route]) =>
    matchesRoute(pathname, route),
  );

export type PathClass =
  | { kind: "public_skip" }
  | { kind: "auth_route" }
  | { kind: "open" }
  | { kind: "auth_only" }
  | { kind: "restricted"; route: string; allowed: Role[] };

/** Classifies a path in the same order as middleware. public_skip / open bypass getUser. */
export const classifyPath = (pathname: string): PathClass => {
  if (isPublicSkipPath(pathname)) {
    return { kind: "public_skip" };
  }

  const restrictedRoute = findRestrictedRoute(pathname);
  const isProtectedRoute = isAuthOnlyPath(pathname) || !!restrictedRoute;

  // /login is classified before restricted/auth_only. No protected route currently has a /login
  // prefix; revisit this order if one (e.g. /login/admin) is added.
  if (isAuthRoute(pathname)) {
    return { kind: "auth_route" };
  }

  if (!isProtectedRoute) {
    return { kind: "open" };
  }

  if (restrictedRoute) {
    return {
      kind: "restricted",
      route: restrictedRoute[0],
      allowed: restrictedRoute[1],
    };
  }

  return { kind: "auth_only" };
};
