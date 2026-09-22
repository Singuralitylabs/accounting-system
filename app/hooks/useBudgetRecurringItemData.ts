import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  retryUnlessForbidden,
} from "../utils/budgetDeclaration";
import { notifyError, notifySuccess, toErrorMessage } from "../utils/notify";

// 定期明細の一覧（管理セクション用。可視範囲は RLS が担保する）
export const useBudgetRecurringItemList = (
  initialData?: BudgetRecurringItemType[] | null,
) => {
  return useQuery({
    queryKey: ["budgetRecurringItems", "all"],
    queryFn: async () => {
      const { items, error } = await getBudgetRecurringItemList();
      if (error) {
        throw new BudgetDeclarationError(error);
      }
      return items;
    },
    initialData: initialData ?? undefined,
    staleTime: 2 * 60 * 1000, // 2分
    retry: retryUnlessForbidden,
  });
};

// 定期明細の一括登録・更新・削除（ステージング編集 + 一括保存）
export const useSaveBudgetRecurringItems = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // 非冪等な書き込み（削除を含む）のため、グローバル retry による
    // mutationFn 再実行を防ぐ（useSaveBudgetDeclaration と同方針）
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
      // 定期明細の変更は次に開く新規申告フォームの初期投入内容に影響するため、
      // 対象月・チームを問わず無効化する
      queryClient.invalidateQueries({
        queryKey: ["budgetDeclarations", "activeRecurringItems"],
      });
      notifySuccess("定期明細を更新しました。");
    },
    onError: (error) => {
      console.error("定期明細の保存エラー:", error);
      const message = toErrorMessage(error, "定期明細の更新に失敗しました。");
      notifyError(
        isPartialWriteFailureError(error)
          ? `${message}\n一部のみ反映されている可能性があるため、画面を再読み込みして内容を確認してください。`
          : message,
      );
    },
  });
};

// 対象月・チームの適用期間内の定期明細（新規申告フォームの初期投入用）。
// usePreviousBudgetDeclarationItems と同じ理由で refetchOnMount: "always" にする
// （他画面での定期明細の追加・変更を、フォームを開き直すたびに反映するため）
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
