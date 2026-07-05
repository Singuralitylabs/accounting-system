import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ROUTE_PERMISSIONS, hasClassAccess } from "./app/utils/permissions";
import type { Database } from "./app/lib/database.types";

// pathname がルート自身またはその配下かどうか
const matchesRoute = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

// JWT（access_token）のペイロードから user_class クレームを読む。
// Custom Access Token Hook（migration 15）が付与する。DB 往復なしでロールを取得できる。
// フック未設定/旧トークンでクレームが無い場合は null を返し、呼び出し側で DB フォールバックする。
const readClassClaim = (accessToken: string | undefined): string | null => {
  if (!accessToken) return null;
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { user_class?: unknown };
    return typeof payload.user_class === "string" ? payload.user_class : null;
  } catch {
    return null;
  }
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 認証チェック（getSession）の前に、認証不要なパスを先に返す。
  // 除外は拡張子ホワイトリスト方式（フェイルクローズ）とし、
  // ここに該当しないパスは必ず認証チェックへ落とす
  const isPublicFile =
    pathname.match(/\.(js|css|ico|png|jpg|jpeg|svg|gif)$/) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api");

  if (isPublicFile || pathname.startsWith("/auth/")) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  try {
    // getSession はローカルの JWT を読む（有効期限内は Auth への往復なし。期限切れ時のみ
    // リフレッシュで往復）。ロールは JWT の user_class クレームから取得するため、
    // 制限ルートでも profiles への DB クエリは原則不要になる。
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;

    const isProtectedRoute =
      pathname === "/" ||
      matchesRoute(pathname, "/new") ||
      Object.keys(ROUTE_PERMISSIONS).some((route) =>
        matchesRoute(pathname, route),
      );

    const isAuthRoute = pathname.startsWith("/login");

    if (!user && isProtectedRoute) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // ロール制限のあるルートは ROUTE_PERMISSIONS に基づいて一括チェックする
    const restrictedRoute = Object.entries(ROUTE_PERMISSIONS).find(([route]) =>
      matchesRoute(pathname, route),
    );
    if (user && restrictedRoute) {
      // まず JWT の user_class クレームからロールを読む（DB 往復なし）
      let userClass = readClassClaim(session?.access_token);

      // クレームが無い場合（Custom Access Token Hook 未設定 / 旧トークン）は
      // profiles への DB クエリにフォールバックする（フェイルセーフ）
      if (userClass === null) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("class")
          .eq("user_id", user.id)
          .single();

        if (profileError) {
          console.error("Profile fetch error:", profileError);
          return NextResponse.redirect(new URL("/", req.url));
        }
        userClass = profile?.class ?? null;
      }

      if (!hasClassAccess(restrictedRoute[1], userClass)) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    }

    if (user && isAuthRoute) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return res;
  } catch (error) {
    console.error("Middleware error:", error);
    return NextResponse.redirect(new URL("/login", req.url));
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
