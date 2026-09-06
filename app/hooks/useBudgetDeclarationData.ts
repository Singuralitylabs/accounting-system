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

// 申告の明細（行を開いたときだけ取得する）。declarationId は一覧行が保持している。
// 読み取り専用の明細パネルと、書き込みを行う編集フォームの両方がこのクエリキーを
// 共有する。staleTime（2分）内のキャッシュを編集フォームがそのまま使うと、他の
// 担当者が直近で更新した明細を古いまま保存してしまう（lost update）ため、
// マウントのたびに staleTime を無視して必ず再取得する（refetchOnMount: "always"）
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
    staleTime: 2 * 60 * 1000, // 2分（明細パネルの再表示での不要な再取得を抑える目的）
    refetchOnMount: "always",
    retry: retryUnlessForbidden,
  });
};

// 申告の作成・編集（ヘッダ + 明細差し替え）。
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
    onSuccess: (result, variables) => {
      // 一覧は対象月・チームの組み合わせ次第でどの行が変わるか分からないため
      // list 全体（月違い含む）を無効化し、明細は保存した申告の分だけ無効化する
      queryClient.invalidateQueries({
        queryKey: ["budgetDeclarations", "list"],
      });
      queryClient.invalidateQueries({
        queryKey: ["budgetDeclarations", "detail", result.id],
      });
      notifySuccess(
        variables.declarationId === null
          ? `${variables.team}の事前収支申告を作成しました。`
          : `${variables.team}の事前収支申告を更新しました。`,
      );
    },
    onError: (error) => {
      console.error("事前収支申告の保存エラー:", error);
      // ヘッダの作成/更新・明細の差し替えは DB 関数（save_budget_declaration、
      // migration 21）内の単一トランザクションで行われるため、失敗時は保存前の
      // 状態に完全にロールバックされる（一部だけ反映された状態にはならない）。
      // そのためキャッシュの無効化は不要
      notifyError(toErrorMessage(error, "事前収支申告の保存に失敗しました。"));
    },
  });
};

// 申告の削除
export const useDeleteBudgetDeclaration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // 削除は非冪等（成功後にレスポンスが失われても再試行すると 0 行ヒットになり、
    // 実際は削除済みなのに失敗として扱われる）。useSaveBudgetDeclaration と同様に
    // グローバル retry による mutationFn 再実行を防ぐ
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
