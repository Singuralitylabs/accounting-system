"use server";

import { User } from "@supabase/supabase-js";
import { ProfilesType } from "../../types/types";
import { isAllowedEmailDomain } from "../constants";
import { getCachedProfileInfo, getCachedProfileInfoById } from "./requestCache";
import { createServerSupabase } from "./clients";

export const getProfileInfo = async () => {
  try {
    return await getCachedProfileInfo();
  } catch (error) {
    console.error("Unexpected error in getProfileInfo:", error);
    return { error: new Error("予期せぬエラーが発生しました。") };
  }
};

export const getProfileInfoById = async (userId: string) => {
  try {
    return await getCachedProfileInfoById(userId);
  } catch (error) {
    console.error("Unexpected error in getProfileInfoById:", error);
    return { error: new Error("予期せぬエラーが発生しました。") };
  }
};

// 取得失敗（DB 障害・権限エラー）と「0 件」を呼び出し元が区別できるよう、
// error を握りつぶさず結果に含めて返す。
export const getAllUserInfo = async () => {
  const supabase = createServerSupabase();

  const { data: userInfoList, error } = await supabase
    .from("profiles")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("ユーザー情報の取得に失敗しました:", error);
  }

  return { userInfoList, error };
};

// 担当者選択の選択肢（全メンバーの id/name）を返す。profiles への直接 SELECT
// （getAllUserInfo）は RLS で teamleader が自チームに絞られるため使えない
// （事前収支申告は teamleader もアクセスでき、選択肢は全メンバーである必要がある）。
// DB 関数 get_member_options（SECURITY DEFINER。migration 21）経由で取得する
// エラー時のログは呼び出し元（利用箇所の文脈が分かる場所）に任せる。
// ここで console.error すると、呼び出し元も別途ログする場合に同じエラーが
// 2 回出力されてノイズになる（DynamicBudgetDeclarations.tsx 参照）
export const getMemberOptions = async () => {
  const supabase = createServerSupabase();

  const { data: memberOptions, error } = await supabase.rpc(
    "get_member_options",
  );

  return { memberOptions, error };
};

export const insertUserInfo = async ({
  user,
  name,
  email,
}: {
  user: User;
  name: string;
  email: string;
}) => {
  // 多層防御: 呼び出し元（OAuth コールバック）でもドメイン検証しているが、
  // プロフィール作成の最終段でも許可ドメイン外を弾く。
  if (!isAllowedEmailDomain(email)) {
    console.warn(`許可されていないドメインのプロフィール作成を拒否しました: ${email}`);
    return { error: new Error("許可されていないドメインのメールアドレスです。") };
  }

  const supabase = createServerSupabase();

  try {
    const { error: insertError } = await supabase
      .from("profiles")
      .insert([
        {
          user_id: user.id,
          email: email,
          name: name,
          class: "public",
          inserted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error(
        `profilesテーブルへの${name}の追加処理で失敗しました。`,
        insertError
      );
      return { error: insertError };
    }

    return { error: null };
  } catch (error) {
    console.error("Unexpected error during insert:", error);
    return { error };
  }
};

export const updateUserInfo = async ({
  profile,
}: {
  profile: ProfilesType;
}) => {
  const supabase = createServerSupabase();

  try {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        slack_id: profile.slack_id,
        class: profile.class,
        team: profile.team,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id)
      .select();

    if (updateError) {
      console.error(
        `profilesテーブルへの${profile.id}の更新処理で失敗しました。`,
        updateError
      );
      return { error: updateError };
    }

    return { error: null };
  } catch (error) {
    console.error("Unexpected error during update Profile:", error);
    return { error };
  }
};
