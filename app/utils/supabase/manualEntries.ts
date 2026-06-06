"use server";

import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "../../lib/database.types";
import { ManualEntryInListType } from "../../types/types";

// 月キー（YYYY-MM）を月初日（YYYY-MM-01）の date 文字列に変換する
const toFirstOfMonth = (month: string): string => `${month}-01`;

// 一覧の行データを DB 書き込み用の形に変換する（INSERT / UPDATE 共通）
// 計上月は編集モーダルで選択中の月に固定するため、行データではなく month 引数を使う。
// 種別と分類・品目の整合性（売上=分類のみ / 費用=品目のみ）はここで揃え、DB の
// CHECK 制約（manual_entries_type_breakdown_check）でも担保する。
// updated_at は DB トリガー（update_manual_entries_updated_at）が JST で設定する
const toDbRow = (entry: ManualEntryInListType, month: string) => ({
  entry_type: entry.entry_type,
  name: entry.name,
  category: entry.entry_type === "revenue" ? entry.category : null,
  item: entry.entry_type === "cost" ? entry.item : null,
  amount: entry.amount,
  team: entry.team,
  target_month: toFirstOfMonth(month),
  comment: entry.comment ?? "",
});

// 対象月（month: "YYYY-MM"）の案件外収支一覧の取得
export const getManualEntryList = async (month: string) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: manualEntryList, error } = await supabase
    .from("manual_entries")
    .select("*")
    .eq("target_month", toFirstOfMonth(month))
    .order("id", { ascending: true });

  if (error) {
    console.error("案件外収支情報の取得に失敗しました:", error);
  }

  return { manualEntryList, error };
};

// 案件外収支の一括登録・更新・削除（month: "YYYY-MM"）
// 書き込み権限（accounting / admin のみ）は RLS で担保される
export const bulkUpsertManualEntry = async (
  month: string,
  manualEntries: ManualEntryInListType[]
) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  // 新規作成用
  const newEntries = manualEntries.filter((me) => me.isNew && !me.isRemoved);
  // 更新用
  const updateEntries = manualEntries.filter(
    (me) => !me.isNew && !me.isRemoved
  );
  // 削除用
  const deleteEntries = manualEntries.filter((me) => me.isRemoved && !me.isNew);

  const operations = [];

  // バルクINSERT
  if (newEntries.length > 0) {
    operations.push(
      supabase
        .from("manual_entries")
        .insert(newEntries.map((me) => toDbRow(me, month)))
    );
  }

  // バルクUPDATE
  if (updateEntries.length > 0) {
    const updatePromises = updateEntries.map((me) => {
      if (!me.id) {
        throw new Error("更新対象の案件外収支IDが見つかりません");
      }

      return supabase
        .from("manual_entries")
        .update(toDbRow(me, month))
        .eq("id", me.id);
    });
    operations.push(...updatePromises);
  }

  // バルクDELETE
  if (deleteEntries.length > 0) {
    const deleteIds = deleteEntries
      .map((me) => me.id)
      .filter((id) => id !== undefined);
    if (deleteIds.length > 0) {
      operations.push(
        supabase.from("manual_entries").delete().in("id", deleteIds)
      );
    }
  }

  // 全て並列実行
  if (operations.length > 0) {
    const results = await Promise.all(operations);
    const errors = results
      .filter((result) => result.error)
      .map((result) => result.error);

    if (errors.length > 0) {
      console.error(
        "案件外収支情報のバルク操作でエラーが発生しました:",
        errors
      );
      throw new Error("案件外収支情報の更新に失敗しました");
    }
  }

  return true;
};
