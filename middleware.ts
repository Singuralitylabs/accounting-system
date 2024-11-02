import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // セッションの更新
  await supabase.auth.getSession();

  // 保護されたルートの設定（必要に応じて）
  const path = req.nextUrl.pathname;
  const session = await supabase.auth.getSession();

  if (path.startsWith("/protected") && !session.data.session) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
