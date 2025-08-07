import {
  getProfileInfo,
  insertUserInfo,
} from "@/app/utils/supabase/supabaseServer";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    
    if (exchangeError) {
      console.error("セッション交換エラー:", exchangeError);
      return NextResponse.redirect(`${requestUrl.origin}/auth-error`);
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("Error getting user:", userError);
      return NextResponse.redirect(`${requestUrl.origin}/auth-error`);
    }

    const { profileInfo } = await getProfileInfo();

    if (!profileInfo) {
      const email = user.email || "";
      const name = user.user_metadata.full_name || user.user_metadata.name;

      const { error: profileError } = await insertUserInfo({
        user,
        name,
        email,
      });

      if (profileError) {
        console.error("Error creating profile:", profileError);
      }
    }
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin));
}
