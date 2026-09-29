"use server";

import { RecurringCostInListType } from "../../types/types";
import { toFirstOfMonthOrNull } from "../formatter";
import { createServerSupabase } from "./clients";

// Shared by INSERT / UPDATE. updated_at is set by the update_recurring_costs_updated_at trigger.
const toDbRow = (rc: RecurringCostInListType) => ({
  name: rc.name,
  item: rc.item,
  price: rc.price,
  team: rc.team,
  payment_cycle: rc.payment_cycle,
  start_month: toFirstOfMonthOrNull(rc.start_month)!,
  end_month: toFirstOfMonthOrNull(rc.end_month),
  comment: rc.comment ?? "",
});

export const getRecurringCostList = async () => {
  const supabase = createServerSupabase();

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
  const supabase = createServerSupabase();

  const newCosts = recurringCosts.filter((rc) => rc.isNew && !rc.isRemoved);
  const updateCosts = recurringCosts.filter((rc) => !rc.isNew && !rc.isRemoved);
  const deleteCosts = recurringCosts.filter((rc) => rc.isRemoved && !rc.isNew);

  const operations = [];

  if (newCosts.length > 0) {
    operations.push(
      supabase.from("recurring_costs").insert(newCosts.map(toDbRow))
    );
  }

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
