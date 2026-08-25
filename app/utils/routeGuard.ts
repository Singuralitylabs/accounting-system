import {
  isAuthApiError,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js";
import type { AuthError } from "@supabase/supabase-js";
import { ROUTE_PERMISSIONS, isAuthOnlyPath, type Role } from "./permissions";

export const PUBLIC_FILE_PATTERN = /\.(js|css|ico|png|jpg|jpeg|svg|gif)$/;

export const matchesRoute = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

// getUser() のエラーが「Supabase Auth 側の一時的障害」かどうか。
//
// auth-js が AuthRetryableFetchError にするのは fetch 自体の失敗と 502/503/504 のみで、
// 500 や 501 は AuthApiError になる（lib/fetch.ts の NETWORK_ERROR_CODES = [502,503,504]）。
// どちらもトークンの正当性とは無関係なサーバ側障害なので、ステータス 5xx は一律で
// 一時的障害として扱う。偽造・期限切れトークンは 401/403 になるため、この判定に
// 混入することはない。
export const isTransientAuthError = (error: AuthError) =>
  isAuthRetryableFetchError(error) ||
  (isAuthApiError(error) && error.status >= 500);

export const isPublicSkipPath = (pathname: string) =>
  PUBLIC_FILE_PATTERN.test(pathname) ||
  pathname.startsWith("/_next") ||
  pathname.startsWith("/api") ||
  pathname.startsWith("/auth/");

export const isAuthRoute = (pathname: string) => pathname.startsWith("/login");

export const findRestrictedRoute = (pathname: string) =>
  Object.entries(ROUTE_PERMISSIONS).find(([route]) =>
    matchesRoute(pathname, route),
  );

export type PathClass =
  | { kind: "public_skip" }
  | { kind: "auth_route" }
  | { kind: "open" }
  | { kind: "auth_only" }
  | { kind: "restricted"; route: string; allowed: Role[] };

/**
 * middleware と同じ順序でパスを分類する。
 * public_skip / open は getUser 前に通過、それ以外は認証チェック対象。
 */
export const classifyPath = (pathname: string): PathClass => {
  if (isPublicSkipPath(pathname)) {
    return { kind: "public_skip" };
  }

  const restrictedRoute = findRestrictedRoute(pathname);
  const isProtectedRoute = isAuthOnlyPath(pathname) || !!restrictedRoute;

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
