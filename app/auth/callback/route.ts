import { insertUserInfo } from "@/app/utils/supabaseServer";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.exchangeCodeForSession(code);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("Error getting user:", userError);
      return NextResponse.redirect(`${requestUrl.origin}/auth-error`);
    }

    const email = user.email || "";
    const name = user.user_metadata.full_name || user.user_metadata.name;

    const { error: profileError } = await insertUserInfo({ user, name, email });

    if (profileError) {
      console.error("Error creating/updating profile:", profileError);
      // Continue with redirect even if profile update fails
    }
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin));
}
