"use server";

import {
  createServerComponentClient,
  User,
} from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "../lib/database.types";
import { MatterType } from "../types/types";

export const getProfileInfo = async () => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { error: new Error("ユーザー認証情報の取得に失敗しました。") };
  }

  const { data: profileInfo, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (!profileInfo || profileError) {
    return { error: new Error("プロファイル情報の取得に失敗しました。") };
  }

  return { profileInfo };
};

export const getUserInfo = async (id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: userInfo } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id);

  return userInfo ? userInfo[0] : null;
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
  const supabase = createServerComponentClient<Database>({ cookies });

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      email,
      name,
      class: "public",
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
    }
  );

  if (profileError) {
    console.error(
      `profilesテーブルへの${name}の追加処理で失敗しました。`,
      profileError
    );
    return { profileError };
  }

  return { error: null };
};

export const getAllMatterInfoList = async () => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: matterList } = await supabase
    .from("matters")
    .select("*, profiles!inner(*)")
    .order("is_completed", { ascending: true })
    .order("is_fixed", { ascending: false })
    .order("id", { ascending: true });

  return matterList;
};

export const getUserMatterInfoList = async () => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { profileInfo: profileInfo, error } = await getProfileInfo();
  if (error || !profileInfo) {
    console.error("profiles情報の取得処理で失敗しました。", error);
    return null;
  }

  const { data: matterList, error: matterError } = await supabase
    .from("matters")
    .select("*")
    .eq("user_id", profileInfo.id)
    .order("is_fixed", { ascending: true })
    .order("is_completed", { ascending: true })
    .order("id", { ascending: true });

  if (matterError) {
    console.error("案件情報の取得に失敗しました:", matterError);
    return null;
  }

  return matterList;
};

export const getCompletedUserMatterInfoList = async () => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: matterList } = await supabase
    .from("matters")
    .select("*")
    .eq("is_completed", true);

  return matterList;
};

export const getUserCostInfoList = async (matter_id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: costInfoList, error } = await supabase
    .from("costs")
    .select("*")
    .eq("matter_id", matter_id)
    .order("id", { ascending: true });

  return { costInfoList, error };
};

export const insertMatterInfoInSupabase = async (
  title: string,
  category: string,
  team: string,
  amount: number | null,
  billing_address: string,
  start_date: string,
  invoice_date: string | null,
  period_date: string | null,
  is_fixed: boolean,
  description: string | null
) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { profileInfo: profileInfo, error } = await getProfileInfo();
  if (error || !profileInfo) {
    console.error("profiles情報の取得処理で失敗しました。", error);
    return { error: new Error("プロフィール情報の取得に失敗しました。") };
  }

  try {
    const { data, error: insertError } = await supabase
      .from("matters")
      .insert({
        title: title,
        category: category,
        team: team,
        amount: amount,
        billing_address: billing_address,
        start_date: start_date,
        invoice_date: invoice_date,
        period_date: period_date,
        description: description,
        is_fixed: is_fixed,
        is_completed: false,
        user_id: profileInfo.id,
        inserted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error(`案件${title}の追加処理で失敗しました。`, insertError);
      return { error: insertError };
    }

    const newId = data ? data.id : null;

    return { newId, error: null };
  } catch (err) {
    console.error(`予期せぬエラーが発生しました。`, err);
    return { err };
  }
};

export const updateMatterInfoInSupabase = async (matterInfo: MatterType) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: status, error } = await supabase
    .from("matters")
    .update(matterInfo)
    .eq("id", matterInfo.id);

  if (error) {
    console.error(
      `${matterInfo.title}の案件情報の更新処理で失敗しました。`,
      error
    );
    return;
  }

  return { status, error };
};

export const deleteMatterInfoInSupabase = async (id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: status, error } = await supabase
    .from("matters")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(`案件ID : ${id}の案件情報の削除処理で失敗しました。`, error);
    return { status, error };
  }

  return { status, error };
};

export const updateCostInfoInSupabase = async (
  id: number,
  name: string,
  item: string,
  payment_target: string,
  price: number,
  period: string,
  certificate: string,
  withholding: boolean,
  matter_id: number,
  comment: string
) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const formattedPeriod = period
    ? new Date(period).toISOString().split("T")[0]
    : null;

  const { error } = await supabase
    .from("costs")
    .update({
      name: name,
      item: item,
      payment_target: payment_target,
      price: price,
      period: formattedPeriod,
      certificate: certificate,
      withholding: withholding,
      matter_id: matter_id,
      comment: comment,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error(`ID : ${id}のコスト情報の更新処理で失敗しました。`, error);
    return;
  }
};

export const insertCostInfoInSupabase = async (
  name: string,
  item: string,
  payment_target: string,
  price: number,
  period: string,
  certificate: string,
  withholding: boolean,
  matter_id: number,
  comment: string
) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { error } = await supabase
    .from("costs")
    .insert({
      name: name,
      item: item,
      payment_target: payment_target,
      price: price,
      period: period === "" ? null : period,
      certificate: certificate,
      withholding: withholding,
      matter_id: matter_id,
      comment: comment,
    })
    .select();

  if (error) {
    console.error(`${name}のコスト情報の追加処理で失敗しました。`, error);
    return { error };
  }

  return { error };
};

export const deleteCostInfoInSupabase = async (id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { error } = await supabase.from("costs").delete().eq("id", id);

  if (error) {
    console.error(`ID : ${id}のコスト情報の削除処理で失敗しました。`, error);
    return;
  }
};
