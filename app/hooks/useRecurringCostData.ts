import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bulkUpsertRecurringCost } from "../utils/supabase/recurringCosts";
import { fetchRecurringCostList } from "../utils/supabase/clientQueries";
import { RecurringCostInListType, RecurringCostType } from "../types/types";

// 定期費用一覧
// （読み取りはクライアントから Supabase に直接クエリする。clientQueries.ts 参照）
export const useRecurringCostList = (
  initialData?: RecurringCostType[] | null,
) => {
  return useQuery({
    queryKey: ["recurringCosts", "all"],
    queryFn: () => fetchRecurringCostList(),
    initialData: initialData ?? undefined,
    staleTime: 2 * 60 * 1000, // 2分
  });
};

// 定期費用の一括登録・更新・削除
export const useUpsertRecurringCost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recurringCosts: RecurringCostInListType[]) =>
      bulkUpsertRecurringCost(recurringCosts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurringCosts"] });
      // 定期費用の変更は全月の損益レポートに影響するため、損益側もまとめて無効化する
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
    onError: (error) => {
      console.error("定期費用更新エラー:", error);
    },
  });
};
