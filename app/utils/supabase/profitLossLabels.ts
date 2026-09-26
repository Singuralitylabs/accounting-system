"use server";

import { AccessFailure, LabelTarget } from "../../types/types";
import { PL_LABEL_WRITE_CLASSES } from "../permissions";
import { LABEL_MAX_LENGTH, normalizeLabelInput } from "../profitLossLogic";
import { createServerSupabase } from "./clients";
import { getAuthorizedViewer } from "./viewerAccess";

export type SaveProfitLossLabelResult =
  | { deleted: boolean; error?: undefined }
  | { deleted?: undefined; error: AccessFailure };

// 損益計算書の表示タイトルの保存（1件ずつ即時保存。Issue #150）。
// 前後の空白を除去し、空欄なら上書きを削除して元の名称に戻す。保存は DB 関数
// public.save_profit_loss_label（部分 UNIQUE に対する upsert / 削除）を1回呼ぶだけで完結する。
// updated_by は関数内で auth.uid() から解決され、クライアントからは渡さない。
// 書き込み権限（accounting / admin のみ）は RLS でも担保される。
export const saveProfitLossLabel = async (
  target: LabelTarget,
  label: string,
): Promise<SaveProfitLossLabelResult> => {
  const { profileInfo, error } = await getAuthorizedViewer(
    PL_LABEL_WRITE_CLASSES,
    "損益計算書のタイトル",
  );
  if (!profileInfo) {
    return { error };
  }

  const normalized = normalizeLabelInput(label);
  if (normalized !== null && normalized.length > LABEL_MAX_LENGTH) {
    return {
      error: {
        kind: "validationFailed",
        message: `タイトルは${LABEL_MAX_LENGTH}文字以内で入力してください。`,
      },
    };
  }

  const supabase = createServerSupabase();
  const { data, error: rpcError } = await supabase
    .rpc("save_profit_loss_label", {
      p_label: normalized ?? "",
      p_matter_id:
        target.targetType === "matter" ? target.matterId : undefined,
      p_business_id:
        target.targetType === "business" ? target.businessId : undefined,
      p_cost_id: target.targetType === "cost" ? target.costId : undefined,
      p_recurring_cost_id:
        target.targetType === "recurring_cost"
          ? target.recurringCostId
          : undefined,
    })
    .single();

  if (rpcError) {
    console.error("損益計算書のタイトルの保存に失敗しました:", rpcError);
    return {
      error: {
        kind: "fetchFailed",
        message: "タイトルの保存に失敗しました。",
      },
    };
  }

  return { deleted: data?.deleted ?? normalized === null };
};
