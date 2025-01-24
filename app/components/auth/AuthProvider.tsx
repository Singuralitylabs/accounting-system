import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import Header from "../Header";
import {
  getProfileInfoById,
  getSelectOptions,
} from "@/app/utils/supabaseServer";
import { InitialOptionsLoader } from "../providers/InitialOptionalLoader";

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
    let initialOptions = null;
    if (session?.user) {
      const { profileInfo } = await getProfileInfoById(session.user.id);
      if (profileInfo) {
        profile = profileInfo;
      }

      const { options: teamList } = await getSelectOptions("team");
      const { options: categoryList } = await getSelectOptions("category");
      const { options: itemList } = await getSelectOptions("item");
      const { options: certificateList } = await getSelectOptions(
        "certificate"
      );

      initialOptions = {
        teamList: teamList.map((team) => team.value),
        categoryList: categoryList.map((category) => category.value),
        itemList: itemList.map((item) => item.value),
        certificateList: certificateList.map(
          (certificate) => certificate.value
        ),
      };
    }

    return (
      <>
        {initialOptions && (
          <InitialOptionsLoader initialOptions={initialOptions} />
        )}
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
