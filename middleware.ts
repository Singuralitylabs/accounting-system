import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import {
  isAuthApiError,
  isAuthRetryableFetchError,
} from "@supabase/supabase-js";
import type { AuthError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ROUTE_PERMISSIONS, hasClassAccess } from "./app/utils/permissions";
import { readClassClaim } from "./app/utils/authClaims";
import type { Database } from "./app/lib/database.types";

// 認証チェック不要な静的アセットの拡張子（ホワイトリスト）
const PUBLIC_FILE_PATTERN = /\.(js|css|ico|png|jpg|jpeg|svg|gif)$/;

// pathname がルート自身またはその配下かどうか
const matchesRoute = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

// getUser() のエラーが「Supabase Auth 側の一時的障害」かどうか。
//
// auth-js が AuthRetryableFetchError にするのは fetch 自体の失敗と 502/503/504 のみで、
// 500 や 501 は AuthApiError になる（lib/fetch.ts の NETWORK_ERROR_CODES = [502,503,504]）。
// どちらもトークンの正当性とは無関係なサーバ側障害なので、ステータス 5xx は一律で
// 一時的障害として扱う。偽造・期限切れトークンは 401/403 になるため、この判定に
// 混入することはない。
const isTransientAuthError = (error: AuthError) =>
  isAuthRetryableFetchError(error) ||
  (isAuthApiError(error) && error.status >= 500);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ネットワークを伴う認証チェック（getUser）の前に、認証不要なパスを先に返す。
  // 除外は拡張子ホワイトリスト方式（フェイルクローズ）とし、
  // ここに該当しないパスは必ず認証チェックへ落とす
  const isPublicFile =
    PUBLIC_FILE_PATTERN.test(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api");

  if (isPublicFile || pathname.startsWith("/auth/")) {
    return NextResponse.next();
  }

  // ロール制限のあるルートは ROUTE_PERMISSIONS に基づいて一括判定する
  const restrictedRoute = Object.entries(ROUTE_PERMISSIONS).find(([route]) =>
    matchesRoute(pathname, route),
  );
  const isProtectedRoute =
    pathname === "/" || matchesRoute(pathname, "/new") || !!restrictedRoute;
  const isAuthRoute = pathname.startsWith("/login");

  // どちらでもないパス（例: /auth-error）は認証状態に関係なく表示してよいため、
  // getUser() の Auth サーバ往復自体を発生させない
  if (!isProtectedRoute && !isAuthRoute) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  // res 以外を返す場合も、getUser()/getSession() が発行したローテーション後の Cookie
  // （リフレッシュされたトークン等）を引き継ぐ。redirect() や新規 NextResponse は
  // 別の Response になるため、res に積まれた Set-Cookie を明示的にコピーしないと失われる。
  // リフレッシュトークンはローテーションされる（supabase/config.toml）ため、
  // 取りこぼすとクライアントが古いトークンを持ったままログアウトさせられる。
  const withCookies = (response: NextResponse) => {
    res.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  };
  const redirectTo = (path: string) =>
    withCookies(NextResponse.redirect(new URL(path, req.url)));

  try {
    // getUser() は Supabase Auth サーバへ問い合わせてアクセストークンの署名・有効性を
    // 検証する。getSession() はローカル Cookie の値をそのまま返すだけで署名検証を
    // 行わないため（auth-js 自身が偽装され得る旨を警告している）、認証の可否判定には
    // 使わない（#26: 偽造 Cookie による認証バイパスを防ぐ）。
    const {
      data: { user },
      error: getUserError,
    } = await supabase.auth.getUser();

    if (getUserError && isTransientAuthError(getUserError)) {
      // Supabase Auth 側のネットワークエラー・5xx（一時的障害）。攻撃者が意図的に
      // 発生させることはできないため、ログイン中ユーザーを一律 /login へ飛ばす
      // （＝実質ログアウト扱いにする）のではなく 503 を返し、クライアントの
      // 再試行に委ねる。未ログイン扱いにはしない点でフェイルクローズは維持する。
      console.error(
        "Supabase Auth への到達に失敗しました（一時的障害）:",
        getUserError,
      );
      return withCookies(
        new NextResponse("Service Unavailable", { status: 503 }),
      );
    }

    if (!user && isProtectedRoute) {
      return redirectTo("/login");
    }

    if (user && restrictedRoute) {
      // 直前の getUser() がこのユーザーのアクセストークンの署名を検証済みのため、
      // 同じトークンから読む user_class クレームも改ざんされていないとみなせる
      // （ペイロードのどこかを書き換えると署名検証に失敗し getUser() がエラーになるため）。
      // getSession() はローカル Cookie を読むだけなので追加のネットワーク往復は発生しない。
      const {
        data: { session },
      } = await supabase.auth.getSession();
      // クレームが有効な文字列でない場合（フック未設定 / 旧トークン / プロフィール
      // 未作成で明示的に null 等）は profiles への DB クエリにフォールバックする。
      let userClass = readClassClaim(session?.access_token);

      if (userClass === null) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("class")
          .eq("user_id", user.id)
          .single();

        if (profileError) {
          console.error("Profile fetch error:", profileError);
        }
        userClass = profile?.class ?? null;
      }

      if (!hasClassAccess(restrictedRoute[1], userClass)) {
        return redirectTo("/");
      }
    }

    if (user && isAuthRoute) {
      return redirectTo("/");
    }

    return res;
  } catch (error) {
    console.error("Middleware error:", error);
    return redirectTo("/login");
  }
}

export const config = {
  matcher: [
    // Next.js の静的アセットのみ matcher で除外する。
    // それ以外の除外（拡張子・/api）はコード側のホワイトリストで行い、
    // 未知のパスが認証チェックをすり抜けない（フェイルクローズ）状態を保つ
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
