"use server";

import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "../../lib/database.types";
import { RecurringCostInListType } from "../../types/types";

// 月初日（YYYY-MM-01）の date 文字列に正規化する
const toFirstOfMonth = (dateStr: string | null): string | null =>
  dateStr ? `${dateStr.slice(0, 7)}-01` : null;

// 一覧の行データを DB 書き込み用の形に変換する（INSERT / UPDATE 共通）
// updated_at は DB トリガー（update_recurring_costs_updated_at）が JST で設定する
const toDbRow = (rc: RecurringCostInListType) => ({
  name: rc.name,
  item: rc.item,
  price: rc.price,
  team: rc.team,
  payment_cycle: rc.payment_cycle,
  start_month: toFirstOfMonth(rc.start_month)!,
  end_month: toFirstOfMonth(rc.end_month),
  comment: rc.comment ?? "",
});

export const getRecurringCostList = async () => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data: recurringCostList, error } = await supabase
    .from("recurring_costs")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("定期費用情報の取得に失敗しました:", error);
  }

  return { recurringCostList, error };
};

export const bulkUpsertRecurringCost = async (
  recurringCosts: RecurringCostInListType[]
) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  // 新規作成用
  const newCosts = recurringCosts.filter((rc) => rc.isNew && !rc.isRemoved);
  // 更新用
  const updateCosts = recurringCosts.filter((rc) => !rc.isNew && !rc.isRemoved);
  // 削除用
  const deleteCosts = recurringCosts.filter((rc) => rc.isRemoved && !rc.isNew);

  const operations = [];

  // バルクINSERT
  if (newCosts.length > 0) {
    operations.push(
      supabase.from("recurring_costs").insert(newCosts.map(toDbRow))
    );
  }

  // バルクUPDATE
  if (updateCosts.length > 0) {
    const updatePromises = updateCosts.map((rc) => {
      if (!rc.id) {
        throw new Error("更新対象の定期費用IDが見つかりません");
      }

      return supabase
        .from("recurring_costs")
        .update(toDbRow(rc))
        .eq("id", rc.id);
    });
    operations.push(...updatePromises);
  }

  // バルクDELETE
  if (deleteCosts.length > 0) {
    const deleteIds = deleteCosts
      .map((rc) => rc.id)
      .filter((id) => id !== undefined);
    if (deleteIds.length > 0) {
      operations.push(
        supabase.from("recurring_costs").delete().in("id", deleteIds)
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
      console.error("定期費用情報のバルク操作でエラーが発生しました:", errors);
      throw new Error("定期費用情報の更新に失敗しました");
    }
  }

  return true;
};
