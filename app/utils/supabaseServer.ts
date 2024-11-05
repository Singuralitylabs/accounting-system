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

  const { profileInfo: existingProfileInfo } = await getProfileInfo();

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      email,
      name,
      class: existingProfileInfo?.class ?? "public",
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

export const insertMatterInfo = async (
  title: string,
  category: string,
  team: string,
  start_date: string,
  is_fixed: boolean,
  total_amount: number,
  business_count: number,
  total_cost: number,
  cost_count: number,
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
        start_date: start_date,
        description: description,
        total_amount: total_amount,
        business_count: business_count,
        total_cost: total_cost,
        cost_count: cost_count,
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

export const updateMatterInfo = async (matterInfo: MatterType) => {
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

export const deleteMatterInfo = async (id: number) => {
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

export const getUserCostInfoList = async (matter_id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: costInfoList, error } = await supabase
    .from("costs")
    .select("*")
    .eq("matter_id", matter_id)
    .order("id", { ascending: true });

  return { costInfoList, error };
};

export const updateCostInfo = async (
  id: number,
  name: string,
  item: string,
  payment_target: string,
  price: number,
  period: string,
  certificate: string,
  withholding: boolean,
  matter_id: number,
  comment: string,
  is_completed: boolean
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
      is_completed: is_completed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error(`ID : ${id}のコスト情報の更新処理で失敗しました。`, error);
    return;
  }
};

export const insertCostInfo = async (
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

export const deleteCostInfo = async (id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { error } = await supabase.from("costs").delete().eq("id", id);

  if (error) {
    console.error(`ID : ${id}のコスト情報の削除処理で失敗しました。`, error);
    return;
  }
};

export const getUserBusinessInfoList = async (matter_id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: businessInfoList, error } = await supabase
    .from("business")
    .select("*")
    .eq("matter_id", matter_id)
    .order("id", { ascending: true });

  return { businessInfoList, error };
};

export const insertBusinessInfo = async (
  name: string,
  amount: number,
  invoice_date: string,
  period_date: string,
  matter_id: number
) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { error } = await supabase
    .from("business")
    .insert({
      name: name,
      amount: amount,
      invoice_date: invoice_date,
      period_date: period_date,
      matter_id: matter_id,
    })
    .select();

  if (error) {
    console.error(`${name}の取引先情報の追加処理で失敗しました。`, error);
    return { error };
  }

  return { error };
};

export const updateBusinessInfo = async (
  id: number,
  name: string,
  amount: number,
  invoice_date: string,
  period_date: string,
  matter_id: number,
  is_completed: boolean
) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const formattedInvoice = invoice_date
    ? new Date(invoice_date).toISOString().split("T")[0]
    : null;

  const formattedPeriod = period_date
    ? new Date(period_date).toISOString().split("T")[0]
    : null;

  const { error } = await supabase
    .from("business")
    .update({
      name: name,
      amount: amount,
      invoice_date: formattedInvoice,
      period_date: formattedPeriod,
      matter_id: matter_id,
      is_completed: is_completed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    console.error(`ID : ${id}の取引先情報の更新処理で失敗しました。`, error);
    return;
  }
};

export const deleteBusinessInfo = async (id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { error } = await supabase.from("business").delete().eq("id", id);

  if (error) {
    console.error(`ID : ${id}の取引先情報の削除処理で失敗しました。`, error);
    return;
  }
};
