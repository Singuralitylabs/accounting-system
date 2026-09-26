import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// 確定済みの月の一覧は他画面からも使うため useClosedMonths.ts に分けている（再エクスポート）
export { useClosedMonths } from "./useClosedMonths";
import {
  applyClosingDiffs,
  closeProfitLossMonth,
  dismissClosingDiffs,
  getClosingDiffSummary,
  reopenProfitLossMonth,
  undoClosingDismissals,
} from "../utils/supabase/profitLossClosings";
import { ClosingDiffKey } from "../types/types";

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

// 未処理の差分がある確定済みの月と件数（Issue #149。accounting / admin のみ有効化する）
export const useClosingDiffSummary = (enabled: boolean) =>
  useQuery({
    queryKey: ["profitLoss", "diffSummary"],
    queryFn: async () => {
      const result = await getClosingDiffSummary();
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.summary;
    },
    enabled,
    staleTime: 60 * 1000,
  });

type DiffOperationInput = { month: string; keys: ClosingDiffKey[] };

// 反映・見送り・見送り取り消しの共通のミューテーション。
// 完了後は損益計算書（月次・年間推移・バナーの件数）のキャッシュを無効化する
const useDiffOperation = (
  action: (
    month: string,
    keys: ClosingDiffKey[],
  ) => Promise<{ error?: { message: string } }>,
  label: string,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ month, keys }: DiffOperationInput) => {
      const { error } = await action(month, keys);
      if (error) {
        throw new Error(error.message);
      }
    },
    retry: 0,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
    onError: (error) => {
      console.error(`${label}エラー:`, error);
    },
  });
};

export const useApplyClosingDiffs = () =>
  useDiffOperation(applyClosingDiffs, "確定後の変更の反映");
export const useDismissClosingDiffs = () =>
  useDiffOperation(dismissClosingDiffs, "確定後の変更の見送り");
export const useUndoClosingDismissals = () =>
  useDiffOperation(undoClosingDismissals, "見送りの取り消し");
