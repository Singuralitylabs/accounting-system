import { cache } from "react";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "../../lib/database.types";

// 同一リクエスト（RSC レンダリング）内での auth.getUser() / プロフィール取得を
// 1 回にデデュープするためのキャッシュ。
// AuthProvider・ページ本体・データ取得関数がそれぞれ認証情報を参照しても、
// Supabase への往復はリクエストごとに 1 回で済む。
// Server Action として直接エクスポートすると Next.js の
// 「"use server" ファイルのエクスポートは async 関数のみ」という制約に反するため、
// このファイルは "use server" にせず、supabaseServer.ts の async ラッパー経由で公開する。

export const getCachedUser = cache(async () => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { user, error };
});

export const getCachedProfileInfo = cache(async () => {
  const { user, error: userError } = await getCachedUser();

  if (!user || userError) {
    console.error("User authentication failed:", userError);
    return { error: new Error("ユーザー認証情報の取得に失敗しました。") };
  }

  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: profileInfo, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profileInfo || profileError) {
    console.error("Profile fetch failed:", profileError);
    return { error: new Error("プロファイル情報の取得に失敗しました。") };
  }

  return {
    profileInfo: {
      id: profileInfo.id,
      user_id: profileInfo.user_id,
      email: profileInfo.email,
      name: profileInfo.name,
      slack_id: profileInfo.slack_id,
      team: profileInfo.team,
      class: profileInfo.class,
      inserted_at: profileInfo.inserted_at,
      updated_at: profileInfo.updated_at,
    },
  };
});
