import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ROUTE_PERMISSIONS,
  hasClassAccess,
  readClassClaim,
} from "./app/utils/permissions";
import type { Database } from "./app/lib/database.types";

// pathname がルート自身またはその配下かどうか
const matchesRoute = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

// リダイレクト時も、getUser()/getSession() が発行したローテーション後の Cookie
// （リフレッシュされたトークン等）を引き継ぐ。NextResponse.redirect() は新しい
// Response を作るため、res に積まれた Set-Cookie を明示的にコピーしないと失われる。
const redirectWithCookies = (
  req: NextRequest,
  res: NextResponse,
  path: string,
) => {
  const redirectRes = NextResponse.redirect(new URL(path, req.url));
  res.cookies.getAll().forEach((cookie) => redirectRes.cookies.set(cookie));
  return redirectRes;
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ネットワークを伴う認証チェック（getUser）の前に、認証不要なパスを先に返す。
  // 除外は拡張子ホワイトリスト方式（フェイルクローズ）とし、
  // ここに該当しないパスは必ず認証チェックへ落とす
  const isPublicFile =
    pathname.match(/\.(js|css|ico|png|jpg|jpeg|svg|gif)$/) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api");

  if (isPublicFile || pathname.startsWith("/auth/")) {
    return NextResponse.next();
  }

  const isProtectedRoute =
    pathname === "/" ||
    matchesRoute(pathname, "/new") ||
    Object.keys(ROUTE_PERMISSIONS).some((route) =>
      matchesRoute(pathname, route),
    );
  const isAuthRoute = pathname.startsWith("/login");

  // どちらでもないパス（例: /auth-error）は認証状態に関係なく表示してよいため、
  // getUser() の Auth サーバ往復自体を発生させない
  if (!isProtectedRoute && !isAuthRoute) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  try {
    // getUser() は Supabase Auth サーバへ問い合わせてアクセストークンの署名・有効性を
    // 検証する。getSession() はローカル Cookie の値をそのまま返すだけで署名検証を
    // 行わないため（auth-js 自身が偽装され得る旨を警告している）、認証の可否判定には
    // 使わない（#26: 偽造 Cookie による認証バイパスを防ぐ）。
    const {
      data: { user },
      error: getUserError,
    } = await supabase.auth.getUser();

    if (getUserError && isAuthRetryableFetchError(getUserError)) {
      // Supabase Auth 側のネットワークエラー・5xx（一時的障害）。攻撃者が意図的に
      // 発生させることはできないため、ログイン中ユーザーを一律 /login へ飛ばす
      // （＝実質ログアウト扱いにする）のではなく 503 を返し、クライアントの
      // 再試行に委ねる。未ログイン扱いにはしない点でフェイルクローズは維持する。
      console.error(
        "Supabase Auth への到達に失敗しました（一時的障害）:",
        getUserError,
      );
      return new NextResponse("Service Unavailable", { status: 503 });
    }

    if (!user && isProtectedRoute) {
      return redirectWithCookies(req, res, "/login");
    }

    // ロール制限のあるルートは ROUTE_PERMISSIONS に基づいて一括チェックする
    const restrictedRoute = Object.entries(ROUTE_PERMISSIONS).find(([route]) =>
      matchesRoute(pathname, route),
    );
    if (user && restrictedRoute) {
      // 直前の getUser() がこのユーザーのアクセストークンの署名を検証済みのため、
      // 同じトークンから読む user_class クレームも改ざんされていないとみなせる
      // （ペイロードのどこかを書き換えると署名検証に失敗し getUser() がエラーになるため）。
      // getSession() はローカル Cookie を読むだけなので追加のネットワーク往復は発生しない。
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const classClaim = readClassClaim(session?.access_token);

      // クレームが有効な文字列でない場合（フック未設定 / 旧トークン / プロフィール
      // 未作成で明示的に null 等）は profiles への DB クエリにフォールバックする。
      let userClass: string | null;
      if (classClaim === null) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("class")
          .eq("user_id", user.id)
          .single();

        if (profileError) {
          console.error("Profile fetch error:", profileError);
        }
        userClass = profile?.class ?? null;
      } else {
        userClass = classClaim;
      }

      if (!hasClassAccess(restrictedRoute[1], userClass)) {
        return redirectWithCookies(req, res, "/");
      }
    }

    if (user && isAuthRoute) {
      return redirectWithCookies(req, res, "/");
    }

    return res;
  } catch (error) {
    console.error("Middleware error:", error);
    return redirectWithCookies(req, res, "/login");
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
