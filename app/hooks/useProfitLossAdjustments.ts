import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deleteProfitLossAdjustment,
  saveProfitLossAdjustment,
} from "../utils/supabase/profitLossAdjustments";
import { AdjustmentTarget } from "../types/types";

// 実績額修正の保存（1件ずつ即時保存）
export const useSaveProfitLossAdjustment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      target,
      targetMonth,
      actualAmount,
      reason,
    }: {
      target: AdjustmentTarget;
      targetMonth: string;
      actualAmount: number;
      reason: string;
    }) => {
      const result = await saveProfitLossAdjustment(
        target,
        targetMonth,
        actualAmount,
        reason,
      );
      if (result.error) {
        throw new Error(result.error.message);
      }
      return { deleted: result.deleted };
    },
    onSuccess: () => {
      // 損益調整は損益レポート（月次・年間推移）にのみ影響する
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
    onError: (error) => {
      console.error("損益調整の保存エラー:", error);
    },
  });
};

// 調整の削除（実績額を元データと同額に戻す操作、対象行が当月に存在しない
// 調整の削除の両方で使う）
export const useDeleteProfitLossAdjustment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (adjustmentId: number) => {
      const { error } = await deleteProfitLossAdjustment(adjustmentId);
      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
    onError: (error) => {
      console.error("損益調整の削除エラー:", error);
    },
  });
};
