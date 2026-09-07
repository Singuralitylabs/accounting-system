"use server";

import { ExtraEntryInListType } from "../../types/types";
import {
  buildCopiedExtraEntries,
  excludeDuplicateExtraEntries,
} from "../extraEntry";
import { addMonths, toFirstOfMonth } from "../formatter";
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

// 月キー（YYYY-MM）の範囲を [月初, 翌月初) の半開区間で返す（entry_date の絞り込み用）
const monthDateRange = (month: string) => ({
  start: toFirstOfMonth(month),
  end: toFirstOfMonth(addMonths(month, 1)),
});

// 対象月の前月分の経理追加収支を取得する（損益計算書 月次タブの
// 「前月の経理追加収支をコピー」ボタン用。ボタンの活性判定・確認ダイアログの
// 件数表示・複製元データの取得を兼ねる）。entry_date が前月内の行のみ返す
// （NULL＝月未確定の明細は範囲比較で自動的に除外される）
export const getPreviousMonthExtraEntries = async (month: string) => {
  const supabase = createServerSupabase();
  const previousMonth = addMonths(month, -1);
  const { start: rangeStart, end: rangeEnd } = monthDateRange(previousMonth);

  const { data: extraEntryList, error } = await supabase
    .from("extra_entries")
    .select("*")
    .gte("entry_date", rangeStart)
    .lt("entry_date", rangeEnd)
    .order("entry_date", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("前月の経理追加収支の取得に失敗しました:", error);
  }

  return { extraEntryList, error };
};

// 前月分の経理追加収支（sourceIds で指定した行）を当月分として一括複製する
// （「前月の経理追加収支をコピー」ボタン用）。書き込み権限（accounting / admin
// のみ）は RLS で担保される。
//
// 確認ダイアログでは呼び出し側がクライアント取得済みの一覧から件数・対象月を
// 表示するが、複製元は id 指定でここで改めて取得し直す。これにより、
// (1) 確認から実行までの間に他の利用者が編集・削除した内容を反映できる
//     （削除済みの行は select に含まれず複製されない）、
// (2) INSERT する列を buildCopiedExtraEntries のホワイトリストに揃えられる
//     （呼び出し側が任意の列を指定できる経路を作らない）。
// 取得クエリには sourceIds に加えて前月の日付範囲も必ず付与する。改変された
// リクエストで前月以外の id を渡されても、対象は前月分に限定され、
// 「前月コピー」という機能の前提から外れた複製ができないようにする。
// さらに、当月に既に同一内容の明細がある場合は二重コピーとみなしスキップする
// （確認ダイアログを見逃した連続クリック対策）。
export const copyExtraEntriesFromPreviousMonth = async (
  sourceIds: number[],
  targetMonth: string,
) => {
  if (sourceIds.length === 0) {
    return { insertedCount: 0, skippedCount: 0, error: null };
  }

  const supabase = createServerSupabase();
  const previousMonth = addMonths(targetMonth, -1);
  const { start: previousRangeStart, end: previousRangeEnd } =
    monthDateRange(previousMonth);

  const { data: sourceEntries, error: sourceError } = await supabase
    .from("extra_entries")
    .select("*")
    .in("id", sourceIds)
    .gte("entry_date", previousRangeStart)
    .lt("entry_date", previousRangeEnd);

  if (sourceError) {
    console.error("経理追加収支の前月コピー元の取得に失敗しました:", sourceError);
    return { insertedCount: 0, skippedCount: 0, error: sourceError };
  }

  const rows = buildCopiedExtraEntries(sourceEntries ?? [], targetMonth);
  if (rows.length === 0) {
    return { insertedCount: 0, skippedCount: 0, error: null };
  }

  const { start: targetRangeStart, end: targetRangeEnd } =
    monthDateRange(targetMonth);
  const { data: existingEntries, error: existingError } = await supabase
    .from("extra_entries")
    .select("*")
    .gte("entry_date", targetRangeStart)
    .lt("entry_date", targetRangeEnd);

  if (existingError) {
    console.error("当月の経理追加収支の確認に失敗しました:", existingError);
    return { insertedCount: 0, skippedCount: 0, error: existingError };
  }

  const newRows = excludeDuplicateExtraEntries(rows, existingEntries ?? []);
  const skippedCount = rows.length - newRows.length;
  if (newRows.length === 0) {
    return { insertedCount: 0, skippedCount, error: null };
  }

  const { error: insertError } = await supabase
    .from("extra_entries")
    .insert(newRows);

  if (insertError) {
    console.error("経理追加収支の前月コピーに失敗しました:", insertError);
    return { insertedCount: 0, skippedCount: 0, error: insertError };
  }

  return { insertedCount: newRows.length, skippedCount, error: null };
};
