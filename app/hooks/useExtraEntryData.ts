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

// 経理追加収支一覧（対象月のエントリ＋月未確定のエントリ）。
// 月を切り替えている間は前月の表を残す（毎回フルスピナーにしない）
export const useExtraEntryList = (
  month: string,
  initialData?: ExtraEntryType[] | null,
  // initialData をサーバで取得した時刻。渡さないと TanStack Query は
  // 「今」シードされたものとして扱い、GC 後に古い initialData が
  // 新鮮なデータとして再表示される（QueryProvider は refetchOnMount: false）。
  initialDataUpdatedAt?: number,
) => {
  const queryClient = useQueryClient();
  const queryKey = ["extraEntries", "list", month];
  const query = useQuery({
    queryKey,
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
    staleTime: 2 * 60 * 1000, // 2分
    // 画面を離れている間に無効化された一覧（損益計算書での前月コピー・確定の後など）は、
    // 開き直したときに取り直す（QueryProvider の既定は refetchOnMount: false。
    // 古い一覧のまま編集して二重登録するのを防ぐ。Issue #170）
    refetchOnMount: (query) => query.state.isInvalidated,
    // 月を切り替えている間は前月の表を残す（毎回フルスピナーにしない）
    placeholderData: keepPreviousData,
  });
  // 保存・前月コピー・月次収支の確定などで無効化され（= 古いと分かっている）、まだ
  // 取り直せていない一覧か。再取得に失敗しても成功するまで true のまま残るため、
  // 月を切り替えて戻った場合や画面を開き直した場合も、古い一覧での編集を止められる
  // （Issue #170）。isStale は staleTime の経過でも true になるため区別できない
  const isInvalidated =
    queryClient.getQueryState(queryKey)?.isInvalidated ?? false;
  // 現時点（描画時点ではなく呼び出した時点）の一覧の取得時刻。保存の完了時に読む
  const getDataUpdatedAt = () =>
    queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0;
  return { ...query, isInvalidated, getDataUpdatedAt };
};

// 内容・請求先のサジェスト候補（直近12ヶ月＋月未確定分の過去の入力値）。
// 補助的な表示のため staleTime を長めにし、保存時の ["extraEntries"] 無効化で追従する
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
    staleTime: 10 * 60 * 1000, // 10分
  });
};

// サーバが保存を拒否・失敗として返したことを表すエラー（何も書き込まれていない。
// 保存は 1 トランザクションのため一部だけ保存されることはない）。
// 通信の失敗など結果が分からない場合と画面の案内を分けるために区別する
export class ExtraEntryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtraEntryValidationError";
  }
}

// 経理追加収支の一括登録・更新・削除
export const useUpsertExtraEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // 新規行の INSERT を含む非冪等な書き込みのため、グローバル retry による
    // mutationFn 再実行（コミット後に応答だけ失われた場合の二重登録）を防ぐ。
    // 検証エラー（ExtraEntryValidationError）も再実行せずすぐ表示する
    retry: 0,
    mutationFn: async (extraEntries: ExtraEntryInListType[]) => {
      const result = await bulkUpsertExtraEntry(extraEntries);
      if (result.error) {
        // 保存前の検証（確定済みの月の編集ロック等）で拒否された、または保存に失敗した。
        // いずれも何も書き込まれていない
        throw new ExtraEntryValidationError(result.error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["extraEntries"] });
      // 経理追加収支の変更は月次・年間推移の損益レポートに影響するため、損益側もまとめて無効化する
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
    onError: (error) => {
      console.error("経理追加収支更新エラー:", error);
    },
  });
};

// 対象月の前月分の経理追加収支（「前月の経理追加収支をコピー」ボタンの活性判定・
// 件数表示・複製対象 id の一覧を兼ねる）。表示のみに使い、実際の複製時は
// サーバ側で id 指定により改めて取得するため、ここでの多少のキャッシュ古さは
// 実行結果（実登録件数）には影響しない。staleTime 経過後や、対象月を変える
// （= 月次タブが再マウントされる）たびに最新化する（refetchOnMount: "always"）
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

// 前月分の経理追加収支（sourceIds）を当月分として一括複製する
export const useCopyExtraEntriesFromPreviousMonth = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // 非冪等な書き込みのため、グローバル retry による mutationFn 再実行を防ぐ
    // （useSaveBudgetRecurringItems / useSaveBudgetDeclaration と同方針）
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["extraEntries"] });
      // 経理追加収支の変更は月次・年間推移の損益レポートに影響するため、損益側もまとめて無効化する
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
    onError: (error) => {
      console.error("経理追加収支の前月コピーに失敗しました:", error);
    },
  });
};
