import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deleteProfitLossAdjustment,
  saveProfitLossAdjustment,
} from "../utils/supabase/profitLossAdjustments";
import { AdjustmentTarget } from "../types/types";

export const useSaveProfitLossAdjustment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Non-idempotent write: prevent global retry.
    retry: 0,
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
      return {
        deleted: result.deleted,
        adjustmentAmount: result.adjustmentAmount,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
    onError: (error) => {
      console.error("損益調整の保存エラー:", error);
    },
  });
};

export const useDeleteProfitLossAdjustment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Non-idempotent write: prevent global retry.
    retry: 0,
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
