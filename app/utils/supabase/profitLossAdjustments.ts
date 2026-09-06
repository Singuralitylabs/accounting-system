"use server";

import {
  AccessFailure,
  AdjustmentTarget,
  ProfitLossAdjustmentInsertType,
} from "../../types/types";
import { PL_ADJUSTMENT_WRITE_CLASSES } from "../permissions";
import { toFirstOfMonth } from "../formatter";
import { createServerSupabase } from "./clients";
import { getAuthorizedViewer } from "./viewerAccess";

type SupabaseClient = ReturnType<typeof createServerSupabase>;

// 対象行の現在の元データ金額と、profit_loss_adjustments 側の対象列を返す。
// 保存直前に取得し直すことで、クライアントが持つ古い金額に依存しない
// （元データが調整の保存前後で変わっていても、常に「今の」元データ金額を基準にする）
const fetchSourceAmount = async (
  supabase: SupabaseClient,
  target: AdjustmentTarget,
): Promise<{
  sourceAmount: number;
  idColumn: "business_id" | "cost_id" | "recurring_cost_id";
  targetId: number;
} | null> => {
  switch (target.targetType) {
    case "business": {
      const { data } = await supabase
        .from("business")
        .select("amount")
        .eq("id", target.businessId)
        .maybeSingle();
      if (!data) return null;
      return {
        sourceAmount: data.amount ?? 0,
        idColumn: "business_id",
        targetId: target.businessId,
      };
    }
    case "cost": {
      const { data } = await supabase
        .from("costs")
        .select("price")
        .eq("id", target.costId)
        .maybeSingle();
      if (!data) return null;
      return {
        sourceAmount: data.price,
        idColumn: "cost_id",
        targetId: target.costId,
      };
    }
    case "recurring_cost": {
      const { data } = await supabase
        .from("recurring_costs")
        .select("price")
        .eq("id", target.recurringCostId)
        .maybeSingle();
      if (!data) return null;
      return {
        sourceAmount: data.price,
        idColumn: "recurring_cost_id",
        targetId: target.recurringCostId,
      };
    }
  }
};

const buildInsertRow = (
  target: AdjustmentTarget,
  common: Pick<
    ProfitLossAdjustmentInsertType,
    | "target_month"
    | "adjustment_amount"
    | "source_amount_snapshot"
    | "reason"
    | "adjusted_by"
  >,
): ProfitLossAdjustmentInsertType => {
  switch (target.targetType) {
    case "business":
      return {
        ...common,
        business_id: target.businessId,
        cost_id: null,
        recurring_cost_id: null,
      };
    case "cost":
      return {
        ...common,
        business_id: null,
        cost_id: target.costId,
        recurring_cost_id: null,
      };
    case "recurring_cost":
      return {
        ...common,
        business_id: null,
        cost_id: null,
        recurring_cost_id: target.recurringCostId,
      };
  }
};

export type SaveProfitLossAdjustmentResult = { error?: AccessFailure };

// 実績額修正の保存（1件ずつ即時保存）。書き込み権限（accounting / admin のみ）は
// RLS でも担保される。実績額が元データと同額（差分 0）になった場合は、既存の調整が
// あれば削除する（0 の差分は保存しない。profit_loss_adjustments_amount_check 参照）
export const saveProfitLossAdjustment = async (
  target: AdjustmentTarget,
  targetMonth: string, // "YYYY-MM"
  actualAmount: number,
  reason: string,
): Promise<SaveProfitLossAdjustmentResult> => {
  const { profileInfo, error } = await getAuthorizedViewer(
    PL_ADJUSTMENT_WRITE_CLASSES,
    "損益調整",
  );
  if (!profileInfo) {
    return { error };
  }

  const supabase = createServerSupabase();
  const source = await fetchSourceAmount(supabase, target);
  if (!source) {
    console.error("損益調整の対象データが見つかりません:", target);
    return {
      error: { kind: "fetchFailed", message: "対象データの取得に失敗しました。" },
    };
  }

  const month = toFirstOfMonth(targetMonth);
  const adjustmentAmount = actualAmount - source.sourceAmount;

  // 理由は必須（実績額を元データと同額に戻す＝調整を削除する場合は不要）。
  // クライアント側（ProfitLossAdjustmentModal）でも検証するが、Server Action は
  // 直接呼び出せるためサーバ側でも担保する
  if (adjustmentAmount !== 0 && reason.trim() === "") {
    return {
      error: {
        kind: "validationFailed",
        message: "調整理由を入力してください。",
      },
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("profit_loss_adjustments")
    .select("id")
    .eq("target_month", month)
    .eq(source.idColumn, source.targetId)
    .maybeSingle();

  if (existingError) {
    console.error("損益調整の既存レコード確認に失敗しました:", existingError);
    return {
      error: { kind: "fetchFailed", message: "損益調整の確認に失敗しました。" },
    };
  }

  if (adjustmentAmount === 0) {
    if (!existing) {
      return {};
    }
    const { error: deleteError } = await supabase
      .from("profit_loss_adjustments")
      .delete()
      .eq("id", existing.id);
    if (deleteError) {
      console.error("損益調整の削除に失敗しました:", deleteError);
      return {
        error: { kind: "fetchFailed", message: "損益調整の削除に失敗しました。" },
      };
    }
    return {};
  }

  const row = buildInsertRow(target, {
    target_month: month,
    adjustment_amount: adjustmentAmount,
    source_amount_snapshot: source.sourceAmount,
    reason: reason.trim(),
    adjusted_by: profileInfo.id,
  });

  const { error: writeError } = existing
    ? await supabase
        .from("profit_loss_adjustments")
        .update(row)
        .eq("id", existing.id)
    : await supabase.from("profit_loss_adjustments").insert(row);

  if (writeError) {
    // 既存レコードの確認から INSERT までの間に、他の経理担当者が同じ対象月・対象行へ
    // 調整を保存した場合、部分 UNIQUE インデックス違反（23505）になる。ここまでの
    // check-then-insert には同時実行時の競合の余地があるため、区別できるメッセージにする
    if (writeError.code === "23505") {
      console.error(
        "損益調整の保存が他の更新と競合しました:",
        writeError,
      );
      return {
        error: {
          kind: "duplicate",
          message:
            "他の担当者が同じ対象を更新しました。画面を再読み込みしてもう一度お試しください。",
        },
      };
    }
    console.error("損益調整の保存に失敗しました:", writeError);
    return {
      error: { kind: "fetchFailed", message: "損益調整の保存に失敗しました。" },
    };
  }

  return {};
};

export type DeleteProfitLossAdjustmentResult = { error?: AccessFailure };

// 調整の削除（実績額を元データと同額に戻す操作、および「対象行が当月に存在しない」
// 調整の削除の両方で使う）
export const deleteProfitLossAdjustment = async (
  adjustmentId: number,
): Promise<DeleteProfitLossAdjustmentResult> => {
  const { profileInfo, error } = await getAuthorizedViewer(
    PL_ADJUSTMENT_WRITE_CLASSES,
    "損益調整",
  );
  if (!profileInfo) {
    return { error };
  }

  const supabase = createServerSupabase();
  const { error: deleteError } = await supabase
    .from("profit_loss_adjustments")
    .delete()
    .eq("id", adjustmentId);

  if (deleteError) {
    console.error("損益調整の削除に失敗しました:", deleteError);
    return {
      error: { kind: "fetchFailed", message: "損益調整の削除に失敗しました。" },
    };
  }

  return {};
};
