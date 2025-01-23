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
    // 警告: getSession()の使用はセキュリティリスクを伴いますが、
    // パフォーマンス最適化のために意図的に使用しています。
    // 本番環境で問題が発生した場合はgetUser()に切り替えることを検討してください。
    const {
      data: { session },
    } = await supabase.auth.getSession();

    let profile = null;
    if (session?.user) {
      const { profileInfo } = await getProfileInfoById(session.user.id);
      if (profileInfo) {
        profile = profileInfo;
      }
    }

    return (
      <>
        <Header initialSession={session} initialProfile={profile} />
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
