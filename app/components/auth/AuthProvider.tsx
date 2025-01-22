import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import Header from "../Header";
import { getProfileInfoById } from "@/app/utils/supabaseServer";

export default async function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerComponentClient({ cookies });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let profile = null;
    if (user) {
      const { profileInfo } = await getProfileInfoById(user.id);
      if (profileInfo) {
        profile = profileInfo;
      }
    }

    return (
      <>
        <Header initialUser={user} initialProfile={profile} />
        {children}
      </>
    );
  } catch (error) {
    // セッションが存在しない場合（ログアウト後など）はエラーを表示せずにchildrenのみをレンダリング
    if (
      error instanceof Error &&
      error.message.includes("Auth session missing")
    ) {
      return <>{children}</>;
    }

    // その他の予期せぬエラーの場合はコンソールに出力
    console.error("Unexpected error in AuthProvider:", error);
    return <>{children}</>;
  }
}
