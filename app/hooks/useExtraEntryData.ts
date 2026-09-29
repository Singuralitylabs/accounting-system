import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getExtraEntryList,
  getExtraEntrySuggestions,
  bulkUpsertExtraEntry,
  getPreviousMonthExtraEntries,
  copyExtraEntriesFromPreviousMonth,
} from "../utils/supabase/extraEntries";
import { ExtraEntryInListType, ExtraEntryType } from "../types/types";
import { useQueryWithInvalidation } from "./useQueryWithInvalidation";

export const useExtraEntryList = (
  month: string,
  initialData?: ExtraEntryType[] | null,
  // Time initialData was fetched on the server (see useBudgetDeclarationList).
  initialDataUpdatedAt?: number,
) =>
  // Subscribe to isInvalidated so a list invalidated while away is refetched on reopen and edits on it are blocked (useQueryWithInvalidation).
  useQueryWithInvalidation({
    queryKey: ["extraEntries", "list", month],
    queryFn: async () => {
      const { extraEntryList, error } = await getExtraEntryList(month);
      if (error) {
        throw new Error("経理追加収支情報の取得に失敗しました");
      }
      return extraEntryList ?? [];
    },
    initialData: initialData ?? undefined,
    initialDataUpdatedAt: initialData ? initialDataUpdatedAt : undefined,
    enabled: !!month,
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

// Long staleTime: auxiliary; follows ["extraEntries"] invalidation on save.
export type ExtraEntrySuggestion = Pick<
  ExtraEntryType,
  "description" | "billing_target"
>;

export const useExtraEntrySuggestions = (
  initialData?: ExtraEntrySuggestion[] | null,
) => {
  return useQuery({
    queryKey: ["extraEntries", "suggestions"],
    queryFn: async () => {
      const { suggestionList, error } = await getExtraEntrySuggestions();
      if (error) {
        throw new Error("経理追加収支のサジェスト候補の取得に失敗しました");
      }
      return suggestionList ?? [];
    },
    initialData: initialData ?? undefined,
    staleTime: 10 * 60 * 1000,
  });
};

// Server rejected or failed the save; nothing was written (single transaction). Distinguished from unknown outcomes (e.g. network) for UI messaging.
export class ExtraEntryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtraEntryValidationError";
  }
}

export const useUpsertExtraEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Non-idempotent (INSERT): prevent global retry (double insert after a commit with a lost response). Validation errors show immediately.
    retry: 0,
    mutationFn: async (extraEntries: ExtraEntryInListType[]) => {
      const result = await bulkUpsertExtraEntry(extraEntries);
      if (result.error) {
        throw new ExtraEntryValidationError(result.error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["extraEntries"] });
      // Also invalidate profit/loss reports (monthly and annual).
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
    onError: (error) => {
      console.error("経理追加収支更新エラー:", error);
      if (!(error instanceof ExtraEntryValidationError)) {
        // Outcome unknown (response may have been lost after commit); refetch to show the actual result (the UI blocks editing until then).
        queryClient.invalidateQueries({ queryKey: ["extraEntries"] });
        queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
      }
    },
  });
};

// Previous month's entries; drives button state, count, and ids to copy. Display only: the server refetches by id on copy. Refetch on mount so it refreshes when the month changes.
export const usePreviousMonthExtraEntries = (month: string) => {
  return useQuery<ExtraEntryType[]>({
    queryKey: ["extraEntries", "previousMonth", month],
    queryFn: async () => {
      const { extraEntryList, error } =
        await getPreviousMonthExtraEntries(month);
      if (error) {
        throw new Error("前月の経理追加収支の取得に失敗しました");
      }
      return extraEntryList ?? [];
    },
    enabled: !!month,
    staleTime: 2 * 60 * 1000,
    refetchOnMount: "always",
  });
};

export const useCopyExtraEntriesFromPreviousMonth = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Non-idempotent: prevent global retry.
    retry: 0,
    mutationFn: async ({
      sourceIds,
      targetMonth,
    }: {
      sourceIds: number[];
      targetMonth: string;
    }) => {
      const { insertedCount, skippedCount, error, closedMonthError } =
        await copyExtraEntriesFromPreviousMonth(sourceIds, targetMonth);
      if (closedMonthError) {
        throw new Error(closedMonthError);
      }
      if (error) {
        throw new Error("経理追加収支の前月コピーに失敗しました");
      }
      return { insertedCount, skippedCount };
    },
    // Refetch on failure too: the copy may have been written even if the result could not be read.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["extraEntries"] });
      // Also invalidate profit/loss reports.
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
    onError: (error) => {
      console.error("経理追加収支の前月コピーに失敗しました:", error);
    },
  });
};
