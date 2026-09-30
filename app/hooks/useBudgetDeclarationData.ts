import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import {
  closeBudgetDeclarationMonth,
  getBudgetDeclarationClosings,
  reopenBudgetDeclarationMonth,
} from "../utils/supabase/budgetDeclarationClosings";
import {
  deleteBudgetDeclaration,
  getBudgetDeclarationDetail,
  getBudgetDeclarationList,
  getPreviousBudgetDeclarationItems,
  saveBudgetDeclaration,
} from "../utils/supabase/budgetDeclarations";
import {
  BudgetClosingInfo,
  BudgetDeclarationDetailType,
  BudgetDeclarationPreviousItem,
  BudgetDeclarationSaveInput,
  BudgetDeclarationStatusType,
} from "../types/types";
import {
  BudgetDeclarationError,
  retryUnlessForbidden,
} from "../utils/budgetDeclaration";
import { notifyError, notifySuccess, toErrorMessage } from "../utils/notify";

// Share only the prefix so lists (keyed by month) can be invalidated together by prefix match.
const budgetDeclarationListQueryKey = ["budgetDeclarations", "list"] as const;

const budgetClosingsQueryKey = ["budgetDeclarations", "closings"] as const;

const budgetDeclarationDetailQueryKey = (declarationId: number | null) =>
  ["budgetDeclarations", "detail", declarationId] as const;

// Invalidates list and, when id is given, detail. previousItems and activeRecurringItems are excluded (they refetch on mount).
const invalidateBudgetDeclarationQueries = (
  queryClient: QueryClient,
  declarationId: number | null,
) => {
  queryClient.invalidateQueries({
    queryKey: budgetDeclarationListQueryKey,
  });
  // A write rejected with MONTH_CLOSED means the cached closing state is stale (another user closed
  // the month); the closings query has no window-focus refetch, so refresh it here or the edit
  // buttons would stay enabled until a reload.
  queryClient.invalidateQueries({ queryKey: budgetClosingsQueryKey });
  if (declarationId === null) {
    return;
  }
  queryClient.invalidateQueries({
    queryKey: budgetDeclarationDetailQueryKey(declarationId),
  });
};

export const useBudgetDeclarationList = (
  month: string,
  initialData?: BudgetDeclarationStatusType[],
  // Time initialData was fetched on the server; without it TanStack Query treats it as seeded "now" and re-shows stale initialData as fresh after GC (QueryProvider uses refetchOnMount: false).
  initialDataUpdatedAt?: number,
) => {
  return useQuery({
    queryKey: [...budgetDeclarationListQueryKey, month],
    queryFn: async () => {
      const { rows, error } = await getBudgetDeclarationList(month);
      if (error) {
        throw new BudgetDeclarationError(error);
      }
      return rows;
    },
    initialData,
    initialDataUpdatedAt: initialData ? initialDataUpdatedAt : undefined,
    enabled: !!month,
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
    retry: retryUnlessForbidden,
  });
};

// Shared by the read-only panel and the edit form. Always refetch on mount: reusing cached data within staleTime in the edit form could overwrite another user's recent update (lost update).
export const useBudgetDeclarationDetail = (declarationId: number | null) => {
  return useQuery<BudgetDeclarationDetailType | null>({
    queryKey: budgetDeclarationDetailQueryKey(declarationId),
    queryFn: async () => {
      const { detail, error } = await getBudgetDeclarationDetail(
        declarationId as number,
      );
      if (error) {
        throw new BudgetDeclarationError(error);
      }
      return detail;
    },
    enabled: declarationId !== null,
    // staleTime has no effect on mount refetch (always refetches); it only governs other stale checks such as refetchOnReconnect.
    staleTime: 2 * 60 * 1000,
    refetchOnMount: "always",
    retry: retryUnlessForbidden,
  });
};

// Previous month's items for the "copy previous" button; items: null means no previous declaration. Save/delete mutations do not invalidate this query, so refetch on mount (as in useBudgetDeclarationDetail) to avoid stale cache within gcTime.
export const usePreviousBudgetDeclarationItems = (
  enabled: boolean,
  targetMonth: string,
  team: string,
) => {
  return useQuery<BudgetDeclarationPreviousItem[] | null>({
    queryKey: ["budgetDeclarations", "previousItems", targetMonth, team],
    queryFn: async () => {
      const { items, error } = await getPreviousBudgetDeclarationItems(
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

export const useSaveBudgetDeclaration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Non-idempotent write (unique-violation handling): prevent global retry from re-running mutationFn.
    retry: 0,
    mutationFn: async (input: BudgetDeclarationSaveInput) => {
      const result = await saveBudgetDeclaration(input);
      if (result.error) {
        throw new BudgetDeclarationError(result.error);
      }
      return result;
    },
    onSuccess: (result, variables) => {
      // Which rows change depends on month/team, so invalidate all lists; detail only for the saved declaration.
      invalidateBudgetDeclarationQueries(queryClient, result.id);
      notifySuccess(
        variables.declarationId === null
          ? `${variables.team}の事前収支申告を作成しました。`
          : `${variables.team}の事前収支申告を更新しました。`,
      );
    },
    onError: (error, variables) => {
      console.error("事前収支申告の保存エラー:", error);
      // The DB function (save_budget_declaration) is one transaction, so no partial writes. But the local cache may already be stale (e.g. another user created the same month/team: duplicate 23505; row deleted: P0002), so always invalidate on failure to avoid a stuck stale UI.
      invalidateBudgetDeclarationQueries(queryClient, variables.declarationId);
      notifyError(toErrorMessage(error, "事前収支申告の保存に失敗しました。"));
    },
  });
};

export const useDeleteBudgetDeclaration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Non-idempotent: retrying after a lost response would hit 0 rows and report failure for an already-deleted row.
    retry: 0,
    mutationFn: async (data: { declarationId: number; team: string }) => {
      const result = await deleteBudgetDeclaration(
        data.declarationId,
        data.team,
      );
      if (result.error) {
        throw new BudgetDeclarationError(result.error);
      }
      return result;
    },
    onSuccess: (_result, variables) => {
      // Remove detail so observers do not refetch the deleted declaration.
      queryClient.removeQueries({
        queryKey: budgetDeclarationDetailQueryKey(variables.declarationId),
      });
      queryClient.invalidateQueries({
        queryKey: budgetDeclarationListQueryKey,
      });
      notifySuccess(`${variables.team}の事前収支申告を削除しました。`);
    },
    onError: (error, variables) => {
      console.error("事前収支申告の削除エラー:", error);
      // Zero-row deletes error on double click or delete in another tab; cache may be stale either way, so always invalidate (as in useDeleteMatter).
      invalidateBudgetDeclarationQueries(queryClient, variables.declarationId);
      notifyError(toErrorMessage(error, "事前収支申告の削除に失敗しました。"));
    },
  });
};

// Closed months (all teams). Month keys are "YYYY-MM"; closedMonths feeds CustomMonthPicker's indicator.
export const useBudgetClosings = (
  initialData?: BudgetClosingInfo[],
  initialDataUpdatedAt?: number,
) => {
  const query = useQuery({
    queryKey: budgetClosingsQueryKey,
    queryFn: async () => {
      const { closings, error } = await getBudgetDeclarationClosings();
      if (error) {
        throw new BudgetDeclarationError(error);
      }
      return closings;
    },
    initialData,
    initialDataUpdatedAt: initialData ? initialDataUpdatedAt : undefined,
    staleTime: 60 * 1000,
    retry: retryUnlessForbidden,
  });
  const closingByMonth = useMemo(
    () =>
      new Map((query.data ?? []).map((closing) => [closing.month, closing])),
    [query.data],
  );
  // Not spread: returning the whole query result would opt out of tracked-props re-render
  // optimization. isUnknown = no closing state yet (loading, or failed with nothing cached);
  // callers must not treat it as "open". isLoadFailed separates the failure from plain loading.
  return {
    closingByMonth,
    isUnknown: query.data === undefined,
    isLoadFailed: query.isError && query.data === undefined,
  };
};

const useInvalidateAfterBudgetClosing = () => {
  const queryClient = useQueryClient();
  // Prefix match also refreshes lists and details opened under the new lock.
  return () =>
    queryClient.invalidateQueries({ queryKey: ["budgetDeclarations"] });
};

export const useCloseBudgetDeclarationMonth = () => {
  const invalidate = useInvalidateAfterBudgetClosing();
  return useMutation({
    // No automatic retry; the user re-operates.
    retry: 0,
    mutationFn: async (month: string) => {
      const { error } = await closeBudgetDeclarationMonth(month);
      if (error) {
        throw new BudgetDeclarationError(error);
      }
    },
    // Also on failure: another accountant may have already closed it.
    onSettled: invalidate,
    onError: (error) => {
      console.error("事前収支申告の確定エラー:", error);
    },
  });
};

export const useReopenBudgetDeclarationMonth = () => {
  const invalidate = useInvalidateAfterBudgetClosing();
  return useMutation({
    retry: 0,
    mutationFn: async (month: string) => {
      const { error } = await reopenBudgetDeclarationMonth(month);
      if (error) {
        throw new BudgetDeclarationError(error);
      }
    },
    onSettled: invalidate,
    onError: (error) => {
      console.error("事前収支申告の確定解除エラー:", error);
    },
  });
};
