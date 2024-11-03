import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = req.nextUrl;

  const isProtectedRoute =
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
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

  if (!session && isProtectedRoute) {
    const redirectUrl = new URL("/login", req.url);
    console.log("Redirecting to:", redirectUrl.toString());
    return NextResponse.redirect(redirectUrl);
  }

  if (session && isAuthRoute) {
    const redirectUrl = new URL("/", req.url);
    console.log("Redirecting to:", redirectUrl.toString());
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    // 除外するパス
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
