import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryWithInvalidation } from "./useQueryWithInvalidation";
import {
  bulkSaveBudgetRecurringItems,
  getActiveBudgetRecurringItems,
  getBudgetRecurringItemList,
} from "../utils/supabase/budgetRecurringItems";
import {
  BudgetDeclarationPreviousItem,
  BudgetRecurringItemInListType,
  BudgetRecurringItemType,
} from "../types/types";
import {
  BudgetDeclarationError,
  isPartialWriteFailureError,
  isPreWriteFailureError,
  retryUnlessForbidden,
} from "../utils/budgetDeclaration";
import { notifyError, notifySuccess, toErrorMessage } from "../utils/notify";

// Returns isInvalidated so the list stays locked until the post-save refetch succeeds (same as useRecurringCostList).
export const useBudgetRecurringItemList = (
  initialData?: BudgetRecurringItemType[] | null,
) => {
  return useQueryWithInvalidation({
    queryKey: ["budgetRecurringItems", "all"],
    queryFn: async () => {
      const { items, error } = await getBudgetRecurringItemList();
      if (error) {
        throw new BudgetDeclarationError(error);
      }
      return items;
    },
    initialData: initialData ?? undefined,
    staleTime: 2 * 60 * 1000,
    retry: retryUnlessForbidden,
  });
};

export const useSaveBudgetRecurringItems = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Non-idempotent write (including deletes): prevent global retry.
    retry: 0,
    mutationFn: async (rows: BudgetRecurringItemInListType[]) => {
      const result = await bulkSaveBudgetRecurringItems(rows);
      if (result.error) {
        throw new BudgetDeclarationError(result.error);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgetRecurringItems"] });
      // Affects initial items of the next new declaration form regardless of month/team.
      queryClient.invalidateQueries({
        queryKey: ["budgetDeclarations", "activeRecurringItems"],
      });
      notifySuccess("定期明細を更新しました。");
    },
    onError: (error) => {
      console.error("定期明細の保存エラー:", error);
      // Keep the form only when the server confirmed nothing was written. partialWriteFailed and a
      // lost response (no kind: Failed to fetch, timeout) may already have inserted rows.
      if (isPreWriteFailureError(error)) {
        notifyError(toErrorMessage(error, "定期明細の更新に失敗しました。"));
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["budgetRecurringItems"] });
      queryClient.invalidateQueries({
        queryKey: ["budgetDeclarations", "activeRecurringItems"],
      });
      // Show the server's reason for a partial write (e.g. a row changed by someone else); a lost
      // response has no reason, so it keeps the generic lead.
      const lead = isPartialWriteFailureError(error)
        ? toErrorMessage(error, "定期明細の更新に失敗しました。")
        : "定期明細の更新に失敗しました。";
      notifyError(
        `${lead}一部のみ反映されている可能性があるため、最新の内容を取得して表示します。反映されていない変更は入力し直してください。`,
      );
    },
  });
};

// Refetch on mount (as in usePreviousBudgetDeclarationItems) so changes made elsewhere show when the form reopens.
export const useActiveBudgetRecurringItems = (
  enabled: boolean,
  targetMonth: string,
  team: string,
) => {
  return useQuery<BudgetDeclarationPreviousItem[]>({
    queryKey: ["budgetDeclarations", "activeRecurringItems", targetMonth, team],
    queryFn: async () => {
      const { items, error } = await getActiveBudgetRecurringItems(
        targetMonth,
        team,
      );
      if (error) {
        throw new BudgetDeclarationError(error);
      }
      return items;
    },
    enabled: enabled && !!targetMonth && !!team,
    staleTime: 2 * 60 * 1000,
    refetchOnMount: "always",
    retry: retryUnlessForbidden,
  });
};
