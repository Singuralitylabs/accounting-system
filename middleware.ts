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

  // ネットワークを伴う認証チェックの前に、認証不要なパスを先に返す
  // （静的アセット・/api は config.matcher 側で除外済み）
  if (pathname.startsWith("/auth/")) {
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
    // 認証チェックが不要なパスは middleware 自体を実行しない:
    // - /api 配下
    // - Next.js の静的アセット（_next/static, _next/image）
    // - 拡張子付きの静的ファイル（favicon.ico, 画像, JS/CSS など）
    "/((?!api|_next/static|_next/image|.*\\..*).*)",
  ],
};
