import Header from "../Header";
import {
  getCachedProfileInfo,
  getCachedUser,
} from "@/app/utils/supabase/requestCache";
import { getActiveSelectOptionsByType } from "@/app/utils/supabase/selectOptionsCache";
import { InitialOptionsLoader } from "../providers/InitialOptionalLoader";

export default async function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    // getUser / プロフィール取得はリクエスト内キャッシュを共有しているため、
    // ページ本体側のデータ取得（getProfileInfo 経由）と重複しても往復は 1 回で済む
    const { user } = await getCachedUser();

    let profile = null;
    let initialOptions = null;
    if (user) {
      // プロフィールと選択肢マスタは互いに独立しているため並列で取得する
      const [profileResult, { optionsByType, error: optionsError }] =
        await Promise.all([
          getCachedProfileInfo(),
          getActiveSelectOptionsByType([
            "team",
            "category",
            "item",
            "certificate",
          ]),
        ]);

      // 空のマスタを optionsAtom に投入すると全フォームのチーム・分類・品目が
      // 選べなくなるうえ、利用者は取得失敗に気付けない。握りつぶさず throw する。
      // NOTE: AuthProvider はルートレイアウトから描画されるため、ここで投げた
      // 例外は各セグメントの error.tsx では捕捉されず app/global-error.tsx に
      // 到達する（全ルートが再試行ボタン付きのエラー画面に置き換わる）。
      // マスタが引けない状態は全画面の入力が成立しないため、ページ単位で
      // 部分的に壊れたまま描画を続けるより望ましいと判断している。
      if (optionsError) {
        throw optionsError;
      }

      // プロフィール取得の失敗はヘッダー表示にしか影響しない（認可は middleware /
      // RLS が担う）ため、ログを残したうえでプロフィールなしの描画を続ける。
      if (profileResult.error) {
        console.error(
          "プロフィール情報の取得に失敗しました。",
          profileResult.error,
        );
      }

      profile = profileResult.profileInfo ?? null;

      initialOptions = {
        teamList: optionsByType.team.map((option) => option.value),
        categoryList: optionsByType.category.map((option) => option.value),
        itemList: optionsByType.item.map((option) => option.value),
        certificateList: optionsByType.certificate.map(
          (option) => option.value,
        ),
      };
    }

    return (
      <>
        {initialOptions && (
          <InitialOptionsLoader initialOptions={initialOptions} />
        )}
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

    // その他の予期せぬエラーは握りつぶさず再 throw する
    // （上と同じくルートレイアウト経由のため app/global-error.tsx に到達する）
    console.error("Unexpected error in AuthProvider:", error);
    throw error;
  }
}
