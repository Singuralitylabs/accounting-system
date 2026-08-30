"use server";

import { MatterType } from "../../types/types";
import {
  MATTER_LIST_FILTER_KEYS,
  MatterListFilters,
  isNumericMatterFilterKey,
} from "../matterListFilters";
import { createServerSupabase } from "./clients";
import { NO_ROWS_DELETED } from "./errorCodes";
import { getProfileInfo } from "./profiles";

export const getAllMatterInfoList = async (
  filters: MatterListFilters = {}
) => {
  const supabase = createServerSupabase();
  const userNames =
    filters.user_name && filters.user_name.length > 0
      ? filters.user_name
      : undefined;
  const profileJoin = userNames
    ? `
      profiles!matters_user_id_fkey!inner (
        name,
        slack_id
      )
    `
    : `
      profiles!matters_user_id_fkey (
        name,
        slack_id
      )
    `;

  let query = supabase
    .from("matters")
    .select(
      `
      *,
      ${profileJoin}
    `
    )
    .order("is_completed", { ascending: true })
    .order("is_fixed", { ascending: false })
    .order("id", { ascending: true });

  for (const key of MATTER_LIST_FILTER_KEYS) {
    if (key === "user_name") continue;
    const values = filters[key];
    if (!values || values.length === 0) continue;
    const columnValues = isNumericMatterFilterKey(key)
      ? values.map(Number)
      : values;
    query = query.in(key, columnValues);
  }

  if (userNames) {
    query = query.in("profiles.name", userNames);
  }

  const { data: matterList, error } = await query;

  if (error) {
    console.error("Error fetching matters:", error);
    return null;
  }

  return matterList;
};

export const getUserMatterInfoList = async () => {
  const supabase = createServerSupabase();

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

export const getTeamMatterInfoList = async () => {
  const supabase = createServerSupabase();

  const { profileInfo, error } = await getProfileInfo();
  if (error || !profileInfo) {
    console.error("profiles情報の取得処理で失敗しました。", error);
    return null;
  }

  if (
    !["teamleader", "admin"].includes(profileInfo.class!) ||
    !profileInfo.team
  ) {
    return null;
  }

  const { data: matterList, error: matterError } = await supabase
    .from("matters")
    .select(
      `
      *,
      profiles!matters_user_id_fkey (
        name,
        slack_id
      )
    `
    )
    .eq("team", profileInfo.team)
    .order("is_completed", { ascending: true })
    .order("is_fixed", { ascending: false })
    .order("id", { ascending: true });

  if (matterError) {
    console.error("チーム案件情報の取得に失敗しました:", matterError);
    return null;
  }

  return matterList;
};

export const getCompletedUserMatterInfoList = async () => {
  const supabase = createServerSupabase();

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
  const supabase = createServerSupabase();

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
        unchecked_cost_count: cost_count,
        is_fixed: is_fixed,
        is_completed: false,
        has_updates: false,
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
  const supabase = createServerSupabase();

  const { data: status, error } = await supabase
    .from("matters")
    .update(matterInfo)
    .eq("id", matterInfo.id)
    .select();

  if (error) {
    console.error(
      `${matterInfo.title}の案件情報の更新処理で失敗しました。`,
      error,
    );
    return { status: null, error };
  }

  // RLS で 0 行 / 削除済みでも PostgREST は error なしで [] を返す。
  if (!status || status.length !== 1) {
    const emptyUpdateError = {
      message: `${matterInfo.title}の案件情報の更新対象が見つかりませんでした。`,
    };
    console.error(emptyUpdateError.message, { status });
    return { status: null, error: emptyUpdateError };
  }

  return { status, error: null };
};

// 複数案件を一括で確認完了（is_completed = true）にする。
// 1件ずつ updateMatterInfo を呼ぶと Server Action の往復が件数分発生するため、
// 一括 UPDATE 1回にまとめる。
export const bulkCompleteMatterInfo = async (matterIds: number[]) => {
  const supabase = createServerSupabase();

  const { error } = await supabase
    .from("matters")
    .update({ is_completed: true })
    .in("id", matterIds);

  if (error) {
    console.error(
      `案件ID : ${matterIds.join(", ")}の一括完了処理で失敗しました。`,
      error
    );
    return { error };
  }

  return { error: null };
};

// 複数案件を一括で下書き（is_fixed = false）に戻す。
// Slack 通知後の差し戻し処理で使用する。
export const bulkUnfixMatterInfo = async (matterIds: number[]) => {
  const supabase = createServerSupabase();

  const { error } = await supabase
    .from("matters")
    .update({ is_fixed: false })
    .in("id", matterIds);

  if (error) {
    console.error(
      `案件ID : ${matterIds.join(", ")}の一括差し戻し処理で失敗しました。`,
      error
    );
    return { error };
  }

  return { error: null };
};

export const deleteMatterInfo = async (id: number) => {
  const supabase = createServerSupabase();

  // .select() を付けないと削除行が返らず、RLS で 0 行になっても error は null に
  // なるため、削除できていないのに成功として扱われてしまう。
  const { data: status, error } = await supabase
    .from("matters")
    .delete()
    .eq("id", id)
    .select();

  if (error) {
    console.error(`案件ID : ${id}の案件情報の削除処理で失敗しました。`, error);
    return { status: null, error };
  }

  if (!status || status.length !== 1) {
    // DB 障害と区別できるよう code を持たせる（呼び出し元がメッセージを出し分ける）
    const emptyDeleteError = {
      code: NO_ROWS_DELETED,
      message: `案件ID : ${id}の削除対象が見つかりませんでした。`,
      details: "",
      hint: "",
    };
    console.error(emptyDeleteError.message, { status });
    return { status: null, error: emptyDeleteError };
  }

  return { status, error: null };
};
