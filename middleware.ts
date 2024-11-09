import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getProfileInfo } from "./app/utils/supabaseServer";

const ALLOWED_DOMAIN = "future-tech-association.org";

const isAllowedDomain = (email: string | undefined): boolean => {
  if (!email) return false;
  return email.endsWith(`@${ALLOWED_DOMAIN}`);
};

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user.email && !isAllowedDomain(session.user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (req.nextUrl.pathname === "/accounting") {
    if (!session) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    const { profileInfo: profileInfo } = await getProfileInfo();
    if (
      !profileInfo?.class ||
      (profileInfo.class !== "accounting" && profileInfo.class !== "admin")
    ) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  const { pathname } = req.nextUrl;

  const isProtectedRoute =
    pathname === "/" ||
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

  if (pathname.startsWith("/auth/callback")) {
    if (session?.user.email && !isAllowedDomain(session.user.email)) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return res;
  }

  if (!session && isProtectedRoute) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (session && isAuthRoute) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return res;
}

export const config = {
  matcher: [
    // 除外するパス
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
