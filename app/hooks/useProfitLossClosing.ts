import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// Closed-month list lives in useClosedMonths.ts (shared with other screens); re-exported here.
export { useClosedMonths } from "./useClosedMonths";
import {
  applyClosingDiffs,
  closeProfitLossMonth,
  dismissClosingDiffs,
  getClosingDiffSummary,
  reopenProfitLossMonth,
  undoClosingDismissals,
} from "../utils/supabase/profitLossClosings";
import {
  ClosingDiffKey,
  ClosingDiffSelection,
  ClosingDiffSummaryData,
} from "../types/types";

// Also invalidates extra entries, whose edit lock depends on closing.
const useInvalidateAfterClosing = () => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    queryClient.invalidateQueries({ queryKey: ["extraEntries"] });
  };
};

export const useCloseProfitLossMonth = () => {
  const invalidate = useInvalidateAfterClosing();
  return useMutation({
    mutationFn: async (month: string) => {
      const { error } = await closeProfitLossMonth(month);
      if (error) {
        throw new Error(error.message);
      }
    },
    // No automatic retry; the user re-operates.
    retry: 0,
    // Invalidate on failure too: another accountant may have already closed it (ALREADY_CLOSED).
    onSettled: invalidate,
    onError: (error) => {
      console.error("月次収支の確定エラー:", error);
    },
  });
};

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
    // Invalidate on failure too: it may already be reopened.
    onSettled: invalidate,
    onError: (error) => {
      console.error("月次収支の確定解除エラー:", error);
    },
  });
};

export const useClosingDiffSummary = (enabled: boolean) =>
  useQuery({
    queryKey: ["profitLoss", "diffSummary"],
    queryFn: async () => {
      const result = await getClosingDiffSummary();
      if (result.error) {
        throw new Error(result.error.message);
      }
      const data: ClosingDiffSummaryData = {
        summary: result.summary,
        fromMonth: result.fromMonth,
      };
      return data;
    },
    enabled,
    staleTime: 60 * 1000,
  });

// Shared by apply / dismiss / undo-dismiss. Invalidate on failure too: a rejection means the state changed after display.
const useDiffOperation = <T>(
  action: (
    month: string,
    items: T[],
  ) => Promise<{ error?: { message: string } }>,
  label: string,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ month, items }: { month: string; items: T[] }) => {
      const { error } = await action(month, items);
      if (error) {
        throw new Error(error.message);
      }
    },
    retry: 0,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
    onError: (error) => {
      console.error(`${label}エラー:`, error);
    },
  });
};

export const useApplyClosingDiffs = () =>
  useDiffOperation<ClosingDiffSelection>(
    applyClosingDiffs,
    "確定後の変更の反映",
  );
export const useDismissClosingDiffs = () =>
  useDiffOperation<ClosingDiffSelection>(
    dismissClosingDiffs,
    "確定後の変更の見送り",
  );
export const useUndoClosingDismissals = () =>
  useDiffOperation<ClosingDiffKey>(undoClosingDismissals, "見送りの取り消し");
