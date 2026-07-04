import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ROUTE_PERMISSIONS, hasClassAccess } from "./app/utils/permissions";
import type { Database } from "./app/lib/database.types";

// pathname がルート自身またはその配下かどうか
const matchesRoute = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

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

  const res = NextResponse.next();
  const supabase = createMiddlewareClient<Database>({ req, res });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
      // getUser は上で実行済みのため、ここではロール（class）のみを 1 クエリで取得する
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("class")
        .eq("user_id", user.id)
        .single();

      if (profileError || !hasClassAccess(restrictedRoute[1], profile?.class)) {
        if (profileError) {
          console.error("Profile fetch error:", profileError);
        }
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
