import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ROUTE_PERMISSIONS, hasClassAccess } from "./app/utils/permissions";
import { getProfileInfo } from "./app/utils/supabase/supabaseServer";

// pathname がルート自身またはその配下かどうか
const matchesRoute = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = req.nextUrl;

    const isProtectedRoute =
      pathname === "/" ||
      matchesRoute(pathname, "/new") ||
      Object.keys(ROUTE_PERMISSIONS).some((route) =>
        matchesRoute(pathname, route)
      );

    const isAuthRoute =
      pathname.startsWith("/login") || pathname.startsWith("/auth/callback");

    const isPublicFile =
      pathname.match(/\.(js|css|ico|png|jpg|jpeg|svg|gif)$/) ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api");

    if (isPublicFile) {
      return res;
    }

    if (pathname.startsWith("/auth/")) {
      return res;
    }

    if (!user && isProtectedRoute) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // ロール制限のあるルートは ROUTE_PERMISSIONS に基づいて一括チェックする
    const restrictedRoute = Object.entries(ROUTE_PERMISSIONS).find(([route]) =>
      matchesRoute(pathname, route)
    );
    if (user && restrictedRoute) {
      try {
        const { profileInfo } = await getProfileInfo();
        if (!hasClassAccess(restrictedRoute[1], profileInfo?.class)) {
          return NextResponse.redirect(new URL("/", req.url));
        }
      } catch (error) {
        console.error("Profile fetch error:", error);
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
    // 除外するパス
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
