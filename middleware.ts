import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasClassAccess } from "./app/utils/permissions";
import { readClassClaim } from "./app/utils/authClaims";
import type { Database } from "./app/lib/database.types";
import { classifyPath, isTransientAuthError } from "./app/utils/routeGuard";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ネットワークを伴う認証チェック（getUser）の前に、認証不要なパスを先に返す。
  // 除外は拡張子ホワイトリスト方式（フェイルクローズ）とし、
  // ここに該当しないパスは必ず認証チェックへ落とす
  const pathClass = classifyPath(pathname);

  if (pathClass.kind === "public_skip" || pathClass.kind === "open") {
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

        if (!hasClassAccess(pathClass.allowed, userClass)) {
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
