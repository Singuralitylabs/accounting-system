import { cache } from "react";
import { Database } from "../../lib/database.types";
import { createServerSupabase } from "./clients";

// 同一リクエスト（RSC レンダリング）内での auth.getUser() / プロフィール取得を
// 1 回にデデュープするためのキャッシュ。
// AuthProvider・ページ本体・データ取得関数がそれぞれ認証情報を参照しても、
// Supabase への往復はリクエストごとに 1 回で済む。
// Server Action として直接エクスポートすると Next.js の
// 「"use server" ファイルのエクスポートは async 関数のみ」という制約に反するため、
// このファイルは "use server" にせず、supabaseServer.ts の async ラッパー経由で公開する。

type ProfilesRow = Database["public"]["Tables"]["profiles"]["Row"];

// 呼び出し側が const { profileInfo } = ... と分割代入できるよう、
// 成功・失敗の両ケースで両プロパティを持つ判別可能な union にする
export type ProfileInfoResult =
  | { profileInfo: ProfilesRow; error?: undefined }
  | { profileInfo?: undefined; error: Error };

export const getCachedUser = cache(async () => {
  const supabase = createServerSupabase();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { user, error };
});

export const getCachedProfileInfoById = cache(
  async (userId: string): Promise<ProfileInfoResult> => {
  const supabase = createServerSupabase();

  const { data: profileInfo, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

    if (!profileInfo || profileError) {
      console.error("Profile fetch failed:", profileError);
      return { error: new Error("プロファイル情報の取得に失敗しました。") };
    }

    return { profileInfo };
  }
);

export const getCachedProfileInfo = cache(
  async (): Promise<ProfileInfoResult> => {
  const { user, error: userError } = await getCachedUser();

  if (!user || userError) {
    console.error("User authentication failed:", userError);
    return { error: new Error("ユーザー認証情報の取得に失敗しました。") };
  }

  return getCachedProfileInfoById(user.id);
});
