import {
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

  // /login 配下は restricted / auth_only より先に auth_route へ分類する。
  // 旧 middleware では isAuthRoute と isProtectedRoute は独立フラグだったが、
  // 現行の ROUTE_PERMISSIONS / AUTH_ONLY_ROUTES に /login プレフィックスの
  // 保護ルートは無いため、今日の到達可能なパスでは結果が一致する。
  // 将来 /login/admin のような restricted を足す場合は、この優先順を見直すこと。
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
