import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasClassAccess } from "./app/utils/permissions";
import { readClassClaim } from "./app/utils/authClaims";
import type { Database } from "./app/lib/database.types";
import type { AuthError } from "@supabase/supabase-js";
import {
  AUTH_FETCH_TIMEOUT_MS,
  AUTH_GET_USER_TIMEOUT_MS,
  classifyPath,
  createTimeoutFetch,
  isTransientAuthError,
  withAuthTimeout,
} from "./app/utils/routeGuard";
import { createPostgrestFetch } from "./app/utils/supabase/postgrestFetch";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ネットワークを伴う認証チェック（getUser）の前に、認証不要なパスを先に返す。
  // 除外は拡張子ホワイトリスト方式（フェイルクローズ）とし、
  // ここに該当しないパスは必ず認証チェックへ落とす
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
      // Supabase への 1 リクエストが数秒で打ち切られるようにする（Auth／PostgREST 共通）。
      // 到達不能時に auth-js が指数バックオフで約 30 秒再試行し続けると
      // Edge の 25 秒制限で 504 になるため、短時間で 503 の経路に落とす。
      //
      // さらに PostgREST の `JWT issued at future`（修正前バージョンの不具合）
      // だけを同一トークンで再送する層を外側に重ねる。再試行 1 回ごとに上の
      // 5 秒タイムアウトが適用され、再試行の待ちは合計 700ms しかないため、
      // profiles 取得の外側の打ち切り（AUTH_FETCH_TIMEOUT_MS）に収まる。
      global: {
        fetch: createPostgrestFetch({
          fetch: createTimeoutFetch(AUTH_FETCH_TIMEOUT_MS),
        }),
      },
    },
  );

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
  // Supabase 側の一時的障害は 503 に落とす（未ログイン扱いにはしない）。
  // `Retry-After` を付けてクライアントの再試行に委ねる。
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
    // getUser() は Supabase Auth サーバへ問い合わせてアクセストークンの署名・有効性を
    // 検証する。getSession() はローカル Cookie の値をそのまま返すだけで署名検証を
    // 行わないため（auth-js 自身が偽装され得る旨を警告している）、認証の可否判定には
    // 使わない（#26: 偽造 Cookie による認証バイパスを防ぐ）。
    //
    // 到達不能時は期限切れトークンのリフレッシュ再試行ループが約 30 秒続くため、
    // 外側の待ちも打ち切って 503 に落とす（Edge の 25 秒制限より短くする）。
    // 制限超過は AuthRetryableFetchError になるため、下の `catch` 節で 503 を返す。
    const {
      data: { user },
      error: getUserError,
    } = await withAuthTimeout(
      supabase.auth.getUser(),
      AUTH_GET_USER_TIMEOUT_MS,
    );

    if (getUserError && isTransientAuthError(getUserError)) {
      // Supabase Auth 側のネットワークエラー・5xx（一時的障害）。攻撃者が意図的に
      // 発生させることはできないため、ログイン中ユーザーを一律 /login へ飛ばす
      // （＝実質ログアウト扱いにする）のではなく 503 を返し、クライアントの
      // 再試行に委ねる。未ログイン扱いにはしない点でフェイルクローズは維持する。
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
          // profiles 取得はボディ停滞でも Edge の 25 秒制限に掛からないよう
          // 外側からも打ち切る。制限超過は throw で `catch` 節の 503 に落ちる。
          // それ以外の取得失敗は既存どおり `/` へ転送する。
          // なお `global.fetch` の 5 秒タイムアウトは PostgREST にも適用される。
          const profileQuery = supabase
            .from("profiles")
            .select("class")
            .eq("user_id", user.id)
            .single();
          const { data: profile, error: profileError } = await withAuthTimeout(
            Promise.resolve(profileQuery),
            AUTH_FETCH_TIMEOUT_MS,
          );

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
    // withAuthTimeout の制限超過（AuthRetryableFetchError）は throw で届くため、
    // ここでも一時的障害は 503 に落とす。未ログイン扱いにはしない。
    if (isTransientAuthError(error as AuthError)) {
      return serviceUnavailable(error);
    }
    console.error("Middleware error:", error);
    // /login 上での想定外エラーは /login へ転送すると無限リダイレクトになるため、
    // そのまま進める（ログイン画面の表示に委ねる）。
    if (pathClass.kind === "auth_route") {
      return res;
    }
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
