import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  deleteBudgetDeclaration,
  getBudgetDeclarationDetail,
  getBudgetDeclarationList,
  saveBudgetDeclaration,
} from "../utils/supabase/budgetDeclarations";
import {
  BudgetDeclarationDetailType,
  BudgetDeclarationSaveInput,
  BudgetDeclarationStatusType,
} from "../types/types";
import {
  BudgetDeclarationError,
  isForbiddenError,
} from "../utils/budgetDeclaration";
import { notifyError, notifySuccess, toErrorMessage } from "../utils/notify";

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

// 申告の作成・編集（ヘッダ + 明細差し替え）。
// 対象月・チームの組み合わせ次第で一覧のどの行が更新されるか分からないため、
// 一覧クエリは月単位の絞り込みをせず budgetDeclarations 配下を丸ごと無効化する
export const useSaveBudgetDeclaration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // 非冪等な書き込み（INSERT 一意制約違反の判定を含む）のため、
    // グローバル retry による mutationFn 再実行を防ぐ
    retry: 0,
    mutationFn: async (input: BudgetDeclarationSaveInput) => {
      const result = await saveBudgetDeclaration(input);
      if (result.error) {
        throw new BudgetDeclarationError(result.error);
      }
      return result;
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["budgetDeclarations"] });
      notifySuccess(
        variables.declarationId === null
          ? `${variables.team}の事前収支申告を作成しました。`
          : `${variables.team}の事前収支申告を更新しました。`,
      );
    },
    onError: (error) => {
      console.error("事前収支申告の保存エラー:", error);
      notifyError(toErrorMessage(error, "事前収支申告の保存に失敗しました。"));
    },
  });
};

// 申告の削除
export const useDeleteBudgetDeclaration = () => {
  const queryClient = useQueryClient();

  return useMutation({
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
      queryClient.removeQueries({
        queryKey: ["budgetDeclarations", "detail", variables.declarationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["budgetDeclarations", "list"],
      });
      notifySuccess(`${variables.team}の事前収支申告を削除しました。`);
    },
    onError: (error) => {
      console.error("事前収支申告の削除エラー:", error);
      notifyError(toErrorMessage(error, "事前収支申告の削除に失敗しました。"));
    },
  });
};
