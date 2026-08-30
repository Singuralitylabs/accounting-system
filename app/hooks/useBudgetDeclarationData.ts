import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getBudgetDeclarationDetail,
  getBudgetDeclarationList,
} from "../utils/supabase/budgetDeclarations";
import {
  BudgetDeclarationDetailType,
  BudgetDeclarationStatusType,
} from "../types/types";
import {
  BudgetDeclarationError,
  isForbiddenError,
} from "../utils/budgetDeclaration";

// QueryProvider の既定は retry: 2。権限不足は再試行しても回復しないため打ち切る。
const retryUnlessForbidden = (failureCount: number, error: Error) =>
  !isForbiddenError(error) && failureCount < 2;

// 対象月のチーム別申告状況一覧（month: "YYYY-MM"）
export const useBudgetDeclarationList = (
  month: string,
  initialData?: BudgetDeclarationStatusType[],
  // initialData をサーバで取得した時刻。渡さないと TanStack Query は
  // 「今」シードされたものとして扱い、GC 後に古い initialData が
  // 新鮮なデータとして再表示される（QueryProvider は refetchOnMount: false）。
  initialDataUpdatedAt?: number,
) => {
  return useQuery({
    queryKey: ["budgetDeclarations", "list", month],
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
    staleTime: 2 * 60 * 1000, // 2分
    // 月を切り替えている間は前月の表を残す（毎回フルスピナーにしない）
    placeholderData: keepPreviousData,
    retry: retryUnlessForbidden,
  });
};

// 申告の明細（行を開いたときだけ取得する）。declarationId は一覧行が保持している
export const useBudgetDeclarationDetail = (declarationId: number | null) => {
  return useQuery<BudgetDeclarationDetailType | null>({
    queryKey: ["budgetDeclarations", "detail", declarationId],
    queryFn: async () => {
      const { detail, error } = await getBudgetDeclarationDetail(
        declarationId as number,
      );
      if (error) {
        throw new BudgetDeclarationError(error);
      }
      // 該当なし（null）は正常な結果としてキャッシュする
      return detail;
    },
    enabled: declarationId !== null,
    staleTime: 2 * 60 * 1000, // 2分
    retry: retryUnlessForbidden,
  });
};
