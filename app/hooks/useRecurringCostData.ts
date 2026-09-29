import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getRecurringCostList,
  bulkUpsertRecurringCost,
} from "../utils/supabase/recurringCosts";
import { RecurringCostInListType, RecurringCostType } from "../types/types";
import { useQueryWithInvalidation } from "./useQueryWithInvalidation";

// Returns isInvalidated so a list left invalidated is refetched on reopen and stale edits are blocked (same as useExtraEntryList).
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
    staleTime: 2 * 60 * 1000,
  });

export const useUpsertRecurringCost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Non-idempotent (INSERT): prevent global retry.
    retry: 0,
    mutationFn: (recurringCosts: RecurringCostInListType[]) =>
      bulkUpsertRecurringCost(recurringCosts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurringCosts"] });
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
    onError: (error) => {
      console.error("定期費用更新エラー:", error);
      // Requests are sent in parallel, so partial application or a lost response is possible; refetch to show the actual state (the UI blocks editing until then).
      queryClient.invalidateQueries({ queryKey: ["recurringCosts"] });
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
  });
};
