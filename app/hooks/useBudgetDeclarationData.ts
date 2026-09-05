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
  getPreviousBudgetDeclarationItems,
  saveBudgetDeclaration,
} from "../utils/supabase/budgetDeclarations";
import {
  BudgetDeclarationDetailType,
  BudgetDeclarationPreviousItem,
  BudgetDeclarationSaveInput,
  BudgetDeclarationStatusType,
} from "../types/types";
import {
  BudgetDeclarationError,
  isForbiddenError,
  isPartialWriteFailureError,
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
    // refetchOnMount: "always" のため、マウント時（明細パネルを閉じて再度開く
    // 場合を含む）の再取得可否にはこの staleTime は影響しない（常に再取得する）。
    // 編集フォーム用の lost update 対策（直近の担当者更新を古いまま保存しない）は
    // refetchOnMount 側で担保している。staleTime は reconnect 時の自動再取得
    // （refetchOnReconnect。既定で有効）など、マウント以外のタイミングでの
    // stale 判定に使われる
    staleTime: 2 * 60 * 1000,
    refetchOnMount: "always",
    retry: retryUnlessForbidden,
  });
};

// 対象月の前月・同チームの申告明細（フォームの「前月の明細をコピー」ボタン用）。
// items: null は前月に申告が無いことを示し、呼び出し側でボタンを無効化する判定に使う。
// フォームを開いている間だけ有効化する想定（enabled は呼び出し側が渡す）。
// useBudgetDeclarationDetail と同じ理由で refetchOnMount: "always" にする。
// このクエリは保存・削除ミューテーションが invalidate/remove しないため、
// QueryProvider既定の refetchOnMount: false のままだと、他の月・チームの
// 申告を保存・削除した後にフォームを開き直しても gcTime（10分）内は
// 古いキャッシュ（前月申告なし判定や、削除済み・編集前の明細）がそのまま
// 使われてしまう
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
    onError: (error, variables) => {
      console.error("事前収支申告の保存エラー:", error);
      // ヘッダ保存 → 明細差し替え（全削除→全登録）は複数ステップの非トランザクション
      // 処理のため、失敗時点までの変更（ヘッダの新規作成・更新、明細の削除等）が
      // 既に DB に反映されている可能性がある。無効化しないと、失敗直後にモーダルを
      // 閉じても一覧・明細のキャッシュが保存前の状態のまま残り、実際の DB と食い違う
      // （新規作成の部分失敗ではヘッダだけ残り「未申告」表示のまま再作成を試みて
      // 一意制約違反を繰り返すループにもなる）
      queryClient.invalidateQueries({
        queryKey: ["budgetDeclarations", "list"],
      });
      // 編集時（declarationId が既知）は対象の明細キャッシュも無効化する。
      // 特に明細差し替えの途中で失敗した場合、既存明細が削除済みで
      // ヘッダだけ残っていることがあるため、再度開いたときに実状態を反映させる
      if (variables.declarationId !== null) {
        queryClient.invalidateQueries({
          queryKey: ["budgetDeclarations", "detail", variables.declarationId],
        });
      }
      const message = toErrorMessage(
        error,
        "事前収支申告の保存に失敗しました。",
      );
      // partialWriteFailed（明細差し替えの途中で失敗）のときだけ、途中まで
      // 反映されている可能性がある旨を案内する（RecurringCostList の一括保存と同方針）
      notifyError(
        isPartialWriteFailureError(error)
          ? `${message}\n一部のみ反映されている可能性があるため、画面を再読み込みして内容を確認してください。`
          : message,
      );
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
