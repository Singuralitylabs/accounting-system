import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getRecurringCostList,
  bulkUpsertRecurringCost,
} from "../utils/supabase/recurringCosts";
import { RecurringCostInListType, RecurringCostType } from "../types/types";
import { useQueryWithInvalidation } from "./useQueryWithInvalidation";

// 定期費用一覧。保存後の再取得に失敗したまま離れた場合などの無効化された一覧は、
// 開き直したときに取り直し、古い一覧での編集を止められるよう isInvalidated を返す
// （useExtraEntryList と同じ。useQueryWithInvalidation）
export const useRecurringCostList = (
  initialData?: RecurringCostType[] | null,
) =>
  useQueryWithInvalidation({
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
