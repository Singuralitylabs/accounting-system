"use server";

import { ExtraEntryInListType } from "../../types/types";
import { createServerSupabase } from "./clients";

// 一覧の行データを DB 書き込み用の形に変換する（INSERT / UPDATE 共通）
// 種別ごとの項目の整合性（収入=請求額あり・決済方法なし / 支出=経費・決済方法あり、
// 収入専用項目なし）はここで揃え、DB の CHECK 制約
// （extra_entries_type_fields_check）でも担保する。
// updated_at は DB トリガー（update_extra_entries_updated_at）が now() で設定する
const toDbRow = (entry: ExtraEntryInListType) => {
  const isIncome = entry.entry_type === "income";
  return {
    entry_type: entry.entry_type,
    category: entry.category,
    entry_date: entry.entry_date,
    invoice_number: isIncome ? entry.invoice_number : null,
    description: entry.description,
    billing_target: isIncome ? entry.billing_target : null,
    manager_id: entry.manager_id,
    team: entry.team,
    billing_amount: isIncome ? entry.billing_amount : null,
    // 経費は収入時は任意（未入力 = null）、支出時は必須
    expense_amount: entry.expense_amount,
    payment_method: isIncome ? null : entry.payment_method,
  };
};

// 経理追加収支一覧の取得（RLS により権限に応じた行のみ返る）
export const getExtraEntryList = async () => {
  const supabase = createServerSupabase();

  const { data: extraEntryList, error } = await supabase
    .from("extra_entries")
    .select("*")
    .order("entry_date", { ascending: false, nullsFirst: true })
    .order("id", { ascending: false });

  if (error) {
    console.error("経理追加収支情報の取得に失敗しました:", error);
  }

  return { extraEntryList, error };
};

// 経理追加収支の一括登録・更新・削除
// 書き込み権限（accounting / admin のみ）は RLS で担保される
export const bulkUpsertExtraEntry = async (
  extraEntries: ExtraEntryInListType[]
) => {
  const supabase = createServerSupabase();

  // 新規作成用
  const newEntries = extraEntries.filter((ee) => ee.isNew && !ee.isRemoved);
  // 更新用
  const updateEntries = extraEntries.filter((ee) => !ee.isNew && !ee.isRemoved);
  // 削除用
  const deleteEntries = extraEntries.filter((ee) => ee.isRemoved && !ee.isNew);

  const operations = [];

  // バルクINSERT
  if (newEntries.length > 0) {
    operations.push(
      supabase.from("extra_entries").insert(newEntries.map(toDbRow))
    );
  }

  // バルクUPDATE
  if (updateEntries.length > 0) {
    const updatePromises = updateEntries.map((ee) => {
      if (!ee.id) {
        throw new Error("更新対象の経理追加収支IDが見つかりません");
      }

      return supabase
        .from("extra_entries")
        .update(toDbRow(ee))
        .eq("id", ee.id);
    });
    operations.push(...updatePromises);
  }

  // バルクDELETE
  if (deleteEntries.length > 0) {
    const deleteIds = deleteEntries
      .map((ee) => ee.id)
      .filter((id) => id !== undefined);
    if (deleteIds.length > 0) {
      operations.push(
        supabase.from("extra_entries").delete().in("id", deleteIds)
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
        "経理追加収支情報のバルク操作でエラーが発生しました:",
        errors
      );
      throw new Error("経理追加収支情報の更新に失敗しました");
    }
  }

  return true;
};
