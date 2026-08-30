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

export const getAllUserInfo = async () => {
  const supabase = createServerSupabase();

  const { data: userInfoList } = await supabase
    .from("profiles")
    .select("*")
    .order("id", { ascending: true });

  return userInfoList ? userInfoList : [];
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
