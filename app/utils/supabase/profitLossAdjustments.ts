"use server";

import { AccessFailure, AdjustmentTarget } from "../../types/types";
import { PL_ADJUSTMENT_WRITE_CLASSES } from "../permissions";
import { toFirstOfMonth } from "../formatter";
import { CLOSED_MONTH_LOCK_MESSAGE } from "../profitLossClosing";
import { createServerSupabase } from "./clients";
import { getAuthorizedViewer } from "./viewerAccess";

export type SaveProfitLossAdjustmentResult =
  | { deleted: boolean; adjustmentAmount: number; error?: undefined }
  | { deleted?: undefined; adjustmentAmount?: undefined; error: AccessFailure };

// Saves one actual-amount adjustment immediately. Fetching the source amount, computing the delta
// and saving happen in one transaction (public.save_profit_loss_adjustment) with the target row
// FOR UPDATE, so concurrent changes cannot interleave (separate queries would allow that).
// adjusted_by is resolved from auth.uid() in the function, never sent by the client (RLS WITH CHECK
// also enforces it). Write permission (accounting / admin) is also enforced by RLS.
export const saveProfitLossAdjustment = async (
  target: AdjustmentTarget,
  targetMonth: string,
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
    // Detects the function's RAISE EXCEPTION 'REASON_REQUIRED' (amount differs from source but reason
    // empty); the client validates too, so this guards direct calls.
    // Closed months return MONTH_CLOSED (also RLS-rejected); a month closed mid-save also yields
    // MONTH_CLOSED from the write trigger.
    if (rpcError.message.includes("MONTH_CLOSED")) {
      return {
        error: { kind: "validationFailed", message: CLOSED_MONTH_LOCK_MESSAGE },
      };
    }
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

  // With delta 0 and nothing to delete, deleted=false and adjustment_amount=0 are returned; callers
  // judge "no change" together with adjustmentAmount (profitLossAdjustmentToast.ts).
  return {
    deleted: data?.deleted ?? false,
    adjustmentAmount: Number(data?.adjustment_amount ?? 0),
  };
}

export type DeleteProfitLossAdjustmentResult = { error?: AccessFailure };

// Only for adjustments whose target row is not in the month (returning to the source amount is
// handled inside saveProfitLossAdjustment).
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
  // RLS-rejected DELETE returns no error, just 0 rows, so return the deleted rows and check. A month
  // closed mid-delete yields MONTH_CLOSED from the write trigger.
  const { data, error: deleteError } = await supabase
    .from("profit_loss_adjustments")
    .delete()
    .eq("id", adjustmentId)
    .select("id");

  if (deleteError?.message.includes("MONTH_CLOSED")) {
    return {
      error: { kind: "validationFailed", message: CLOSED_MONTH_LOCK_MESSAGE },
    };
  }
  if (deleteError) {
    console.error("損益調整の削除に失敗しました:", deleteError);
    return {
      error: { kind: "fetchFailed", message: "損益調整の削除に失敗しました。" },
    };
  }
  if (!data || data.length === 0) {
    return {
      error: {
        kind: "validationFailed",
        message: `損益調整を削除できませんでした。${CLOSED_MONTH_LOCK_MESSAGE}（既に削除されている場合は再読み込みしてください）`,
      },
    };
  }

  return {};
};
