import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveProfitLossLabel } from "../utils/supabase/profitLossLabels";
import { LabelTarget } from "../types/types";

// 損益計算書の表示タイトルの保存（1件ずつ即時保存。空欄は削除）
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
    // 保存の再試行で意図しない二重書き込みをしないよう、失敗時は利用者に再操作を促す
    retry: 0,
    onSuccess: () => {
      // タイトルは損益レポート（月次・年間推移・差分一覧）にのみ影響する
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
    onError: (error) => {
      console.error("損益計算書のタイトルの保存エラー:", error);
    },
  });
};
