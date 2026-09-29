import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveProfitLossLabel } from "../utils/supabase/profitLossLabels";
import { LabelTarget } from "../types/types";

export const useSaveProfitLossLabel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      target,
      label,
    }: {
      target: LabelTarget;
      label: string;
    }) => {
      const result = await saveProfitLossLabel(target, label);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return { deleted: result.deleted };
    },
    // No retry, to avoid unintended double writes.
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
    onError: (error) => {
      console.error("損益計算書のタイトルの保存エラー:", error);
    },
  });
};
