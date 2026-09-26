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

// getUser() のエラーが「Supabase Auth 側の一時的障害」かどうか。
//
// auth-js が AuthRetryableFetchError にするのは fetch 自体の失敗と 502/503/504 のみで、
// 500 や 501 は AuthApiError になる（`lib/fetch.js` の NETWORK_ERROR_CODES = [502,503,504]。ソースは `fetch.ts`）。
// どちらもトークンの正当性とは無関係なサーバ側障害なので、ステータス 5xx は一律で
// 一時的障害として扱う。偽造・期限切れトークンは 401/403 になるため、この判定に
// 混入することはない。
export const isTransientAuthError = (error: AuthError) =>
  isAuthRetryableFetchError(error) ||
  (isAuthApiError(error) && error.status >= 500);

// `profiles` 取得のエラーがタイムアウト由来かどうか（Issue #137）。
// 内側の createTimeoutFetch（5 秒）が先に発火すると postgrest-js に捕捉され、
// throw ではなく `{ error: { message: "TimeoutError: ...", code: "" } }` の
// 戻り値になる（postgrest-js の PostgrestBuilder.ts の catch 節が
// `${fetchError?.name}: ${fetchError?.message}` の形式で包むため）。
// そのため withAuthTimeout の外側タイマーによる throw（catch 節の 503）には
// 到達せず、middleware 側でこの判定により 503 に落とす。
// ヘッダ到着後のボディ停滞は外側タイマーが throw するため、両経路で 503 になる。
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

// Supabase への 1 リクエストの打ち切り時間（`@supabase/ssr` の `global.fetch`
// は auth-js と PostgREST の両方に注入されるため、Auth だけでなく後続の
// `profiles` 取得のヘッダ待ちにも適用される。ヘッダ到着後のボディ停滞は
// `middleware.ts` 側の `withAuthTimeout` が担う。
//
// 通常時の応答（数十〜数百 ms）に十分余裕を持たせつつ、応答が返らない
// ハング型の試行を短時間で失敗させる。即時失敗型（DNS 解決失敗など）では
// 試行自体は元々速いまま再試行ループが続くため、ループ全体の打ち切りは
// 下の `withAuthTimeout` が担う。
// fetch の中断（AbortError / TimeoutError）は auth-js の `_handleRequest` が
// `AuthRetryableFetchError`（status 0）に包むため（auth-js 2.65.1 の
// `lib/fetch.js` で確認。将来の更新時は見直すこと）、上の `isTransientAuthError`
// でそのまま一時的障害として拾える。拡張は不要。
export const AUTH_FETCH_TIMEOUT_MS = 5000;

// `getUser()` 全体の待ちの上限。期限切れトークン時のリフレッシュ再試行ループは
// 1 リクエストのタイムアウトだけでは約 30 秒枠いっぱいまで回り続けるため、
// 外側の待ちを `Promise.race` で打ち切って 503 に落とす。受け入れ基準
// 「数秒以内に 503」のため 6 秒とする。
//
// middleware 全体の時間予算（上限の考え方。全て満たすこと）：
// - `getUser()` ≤ 6 秒（本定数）＋後続の `profiles` 取得 ≤ 5 秒
//   （`AUTH_FETCH_TIMEOUT_MS` で外側からも打ち切り）で合計約 11 秒
// - Vercel Edge の 25 秒制限を大きく下回る。定数を変える場合はこの予算を保つこと
//   （`tests/utils/routeGuard.test.ts` の合算テストが回帰を検出する）。
export const AUTH_GET_USER_TIMEOUT_MS = 6000;

/**
 * Edge Runtime 安全なタイムアウト付き fetch を作る。
 *
 * `AbortSignal.timeout` / `AbortSignal.any` に依存せず、`AbortController` +
 * `setTimeout` のみで「呼び出し元の signal」と「タイムアウト」のどちらが先に
 * 発火しても中断する。auth-js（`@supabase/ssr` の `global.fetch` 経由）に渡す想定。
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
 * `getUser()` 等の Auth 呼び出し全体の待ちに上限を設ける。`Promise.race` による
 * 待機解除であり、内側のリトライループ自体を cancel するものではない。
 * 制限超過時は `AuthRetryableFetchError`（status 0）で reject するため、
 * 呼び出し側は `isTransientAuthError` → 503 の既存経路にそのまま載せられる。
 * 503 返却で Edge 実行は終了するため、残存した内側ループは破棄される。
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
