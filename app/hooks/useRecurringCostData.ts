import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getRecurringCostList,
  bulkUpsertRecurringCost,
} from '../utils/supabase/recurringCosts';
import { RecurringCostInListType, RecurringCostType } from '../types/types';

// 定期費用一覧
export const useRecurringCostList = (initialData?: RecurringCostType[] | null) => {
  return useQuery({
    queryKey: ['recurringCosts', 'all'],
    queryFn: async () => {
      const { recurringCostList, error } = await getRecurringCostList();
      if (error) {
        throw new Error('定期費用情報の取得に失敗しました');
      }
      return recurringCostList ?? [];
    },
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
      queryClient.invalidateQueries({ queryKey: ['recurringCosts'] });
      // 定期費用の変更は全月の損益レポートに影響するため、損益側もまとめて無効化する
      queryClient.invalidateQueries({ queryKey: ['profitLoss'] });
    },
    onError: (error) => {
      console.error('定期費用更新エラー:', error);
    },
  });
};
