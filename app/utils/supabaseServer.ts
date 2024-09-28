"use server";

import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "../lib/database.types";
import { MatterType } from "../types/types";

export const supabaseServer = () => {
  cookies().getAll();
  return createServerComponentClient<Database>({ cookies });
};

export const getUserMatterInfoList = async () => {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: matterList } = await supabase.from("matters").select("*");

  return matterList;
};

export const getUserCostInfoList = async (matter_id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: costInfoList, error } = await supabase
    .from("costs")
    .select("*")
    .eq("matter_id", matter_id);

  return { costInfoList, error };
};

export const updateMatterInfoInSupabase = async (matterInfo: MatterType) => {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: status, error } = await supabase
    .from("matters")
    .update(matterInfo)
    .eq("id", matterInfo.id);

  return { status, error };
};

export const deleteMatterInfoInSupabase = async (id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });
  const { data: status, error } = await supabase
    .from("matters")
    .delete()
    .eq("id", id);

  return { status, error };
};

export const updateCostInfoInSupabase = async (
  id: number,
  name: string,
  item: string,
  payment_target: string,
  amount: number,
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
      amount: amount,
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
  amount: number,
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
      amount: amount,
      period: period === "" ? null : period,
      certificate: certificate,
      withholding: withholding,
      matter_id: matter_id,
      comment: comment,
    })
    .select();

  if (error) {
    console.error(`${name}のコスト情報の追加処理で失敗しました。`, error);
    return;
  }
};

export const deleteCostInfoInSupabase = async (id: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { error } = await supabase.from("costs").delete().eq("id", id);

  if (error) {
    console.error(`ID : ${id}のコスト情報の削除処理で失敗しました。`, error);
    return;
  }
};
