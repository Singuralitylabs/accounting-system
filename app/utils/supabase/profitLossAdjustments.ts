"use server";

import { AccessFailure, AdjustmentTarget } from "../../types/types";
import { PL_ADJUSTMENT_WRITE_CLASSES } from "../permissions";
import { toFirstOfMonth } from "../formatter";
import { createServerSupabase } from "./clients";
import { getAuthorizedViewer } from "./viewerAccess";

export type SaveProfitLossAdjustmentResult =
  | { deleted: boolean; error?: undefined }
  | { deleted?: undefined; error: AccessFailure };

// 実績額修正の保存（1件ずつ即時保存）。元データ金額の取得・差分計算・保存を
// DB 関数（public.save_profit_loss_adjustment）内の単一トランザクションで
// 原子的に行う。対象行を FOR UPDATE でロックしたうえで計算するため、保存の
// 途中で元データが変わる・複数人が同時に同じ対象へ保存するといった競合が
// 起きない（アプリ側で「取得 → 差分計算 → 書き込み」を複数クエリに分けると、
// その間に別の変更が挟まる余地が生まれる）。
// adjusted_by は関数内で auth.uid() から解決され、クライアントからは渡さない
// （なりすまし防止。RLS の WITH CHECK でも二重に担保される）。
// 書き込み権限（accounting / admin のみ）は RLS でも担保される。
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
  const { data, error: rpcError } = await supabase
    .rpc("save_profit_loss_adjustment", {
      p_business_id: target.targetType === "business" ? target.businessId : null,
      p_cost_id: target.targetType === "cost" ? target.costId : null,
      p_recurring_cost_id:
        target.targetType === "recurring_cost" ? target.recurringCostId : null,
      p_target_month: toFirstOfMonth(targetMonth),
      p_actual_amount: actualAmount,
      p_reason: reason.trim(),
    })
    .single();

  if (rpcError) {
    // DB 関数内の RAISE EXCEPTION 'REASON_REQUIRED'（実績額が元データと異なるのに
    // 理由が空の場合）を判別できるようにする。クライアント側でも同じ検証を行うため
    // 通常はここに到達しないが、直接の呼び出しに備える
    if (rpcError.message.includes("REASON_REQUIRED")) {
      return {
        error: {
          kind: "validationFailed",
          message: "調整理由を入力してください。",
        },
      };
    }
    console.error("損益調整の保存に失敗しました:", rpcError);
    return {
      error: { kind: "fetchFailed", message: "損益調整の保存に失敗しました。" },
    };
  }

  return { deleted: data?.deleted ?? false };
};

export type DeleteProfitLossAdjustmentResult = { error?: AccessFailure };

// 調整の削除（実績額を元データと同額に戻す操作は saveProfitLossAdjustment が
// 内部で行うため、こちらは「対象行が当月に存在しない」調整の削除専用）
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
