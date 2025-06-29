import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getProfileInfo } from "./app/utils/supabase/supabaseServer";

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
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/accounting") ||
      pathname.startsWith("/new");

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

    if (user && pathname === "/accounting") {
      try {
        const { profileInfo } = await getProfileInfo();
        if (
          !profileInfo?.class ||
          (profileInfo.class !== "accounting" && profileInfo.class !== "admin")
        ) {
          return NextResponse.redirect(new URL("/", req.url));
        }
      } catch (error) {
        console.error("Profile fetch error:", error);
        return NextResponse.redirect(new URL("/", req.url));
      }
    }

    if (user && pathname === "/dashboard") {
      try {
        const { profileInfo } = await getProfileInfo();
        if (!profileInfo?.class || profileInfo.class !== "admin") {
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
