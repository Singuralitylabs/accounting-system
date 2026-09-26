import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  closeProfitLossMonth,
  getClosedMonths,
  reopenProfitLossMonth,
} from "../utils/supabase/profitLossClosings";

// 確定済みの月（"YYYY-MM"）の一覧（Issue #148）。
// 損益計算書のキャッシュ（["profitLoss"]）と一緒に無効化されるよう、キーの先頭を揃える
export const useClosedMonths = (enabled = true) => {
  const query = useQuery({
    queryKey: ["profitLoss", "closedMonths"],
    queryFn: async () => {
      const result = await getClosedMonths();
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.months;
    },
    enabled,
    staleTime: 60 * 1000,
  });
  const closedMonths = useMemo(
    () => new Set<string>(query.data ?? []),
    [query.data],
  );
  return { ...query, closedMonths };
};

// 確定・確定解除の後は、損益計算書（月次・年間推移・確定済みの月の一覧）と、
// 編集ロックが変わる経理追加収支のキャッシュを無効化する
const useInvalidateAfterClosing = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    queryClient.invalidateQueries({ queryKey: ["extraEntries"] });
  };
};

// 月次収支の確定（「確定済み」チェックのオン）
export const useCloseProfitLossMonth = () => {
  const invalidate = useInvalidateAfterClosing();
  return useMutation({
    mutationFn: async (month: string) => {
      const { error } = await closeProfitLossMonth(month);
      if (error) {
        throw new Error(error.message);
      }
    },
    // 確定は再実行すると取り直しになるため、自動で再試行せず利用者に再操作を促す
    retry: 0,
    onSuccess: invalidate,
    onError: (error) => {
      console.error("月次収支の確定エラー:", error);
    },
  });
};

// 確定の解除（「確定済み」チェックのオフ）
export const useReopenProfitLossMonth = () => {
  const invalidate = useInvalidateAfterClosing();
  return useMutation({
    mutationFn: async (month: string) => {
      const { error } = await reopenProfitLossMonth(month);
      if (error) {
        throw new Error(error.message);
      }
    },
    retry: 0,
    onSuccess: invalidate,
    onError: (error) => {
      console.error("月次収支の確定解除エラー:", error);
    },
  });
};
