import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getRecurringCostList,
  bulkUpsertRecurringCost,
} from "../utils/supabase/recurringCosts";
import { RecurringCostInListType, RecurringCostType } from "../types/types";

// 定期費用一覧
export const useRecurringCostList = (
  initialData?: RecurringCostType[] | null,
) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["recurringCosts", "all"],
    queryFn: async () => {
      const { recurringCostList, error } = await getRecurringCostList();
      if (error) {
        throw new Error("定期費用情報の取得に失敗しました");
      }
      return recurringCostList ?? [];
    },
    initialData: initialData ?? undefined,
    staleTime: 2 * 60 * 1000, // 2分
  });
  // 保存の失敗などで無効化され（= 古いと分かっている）、まだ取り直せていない一覧か。
  // 再取得に失敗しても成功するまで true のまま残る
  const isInvalidated =
    queryClient.getQueryState(["recurringCosts", "all"])?.isInvalidated ??
    false;
  return Object.assign(query, { isInvalidated });
};

// 定期費用の一括登録・更新・削除
export const useUpsertRecurringCost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // 新規行の INSERT を含む非冪等な書き込みのため、グローバル retry による
    // mutationFn 再実行（一部の操作だけ失敗した場合などの二重登録）を防ぐ
    retry: 0,
    mutationFn: (recurringCosts: RecurringCostInListType[]) =>
      bulkUpsertRecurringCost(recurringCosts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurringCosts"] });
      // 定期費用の変更は全月の損益レポートに影響するため、損益側もまとめて無効化する
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
    onError: (error) => {
      console.error("定期費用更新エラー:", error);
      // 追加・更新・削除を並列に送るため、一部だけ反映されている、または応答だけ失われて
      // 反映済みの可能性がある。一覧を取り直して実際の状態を表示する（画面側は取り直すまで
      // 編集を止める）
      queryClient.invalidateQueries({ queryKey: ["recurringCosts"] });
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
  });
};
