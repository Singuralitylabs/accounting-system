import { isAllowedEmailDomain } from "@/app/utils/constants";
import { getProfileInfo, insertUserInfo } from "@/app/utils/supabase/profiles";
import { createServerSupabase } from "@/app/utils/supabase/clients";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = createServerSupabase();
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

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

    // Server-side enforcement of the domain restriction (client checks can be bypassed): destroy the session and do not create a profile for accounts outside the allowed domain.
    if (!isAllowedEmailDomain(user.email)) {
      console.warn(
        `許可されていないドメインのログインを拒否しました: ${user.email}`,
      );
      await supabase.auth.signOut();
      return NextResponse.redirect(
        `${requestUrl.origin}/auth-error?reason=domain`,
      );
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
