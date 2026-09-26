import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getExtraEntryList,
  bulkUpsertExtraEntry,
  getPreviousMonthExtraEntries,
  copyExtraEntriesFromPreviousMonth,
} from "../utils/supabase/extraEntries";
import { ExtraEntryInListType, ExtraEntryType } from "../types/types";

// 経理追加収支一覧
export const useExtraEntryList = (initialData?: ExtraEntryType[] | null) => {
  return useQuery({
    queryKey: ["extraEntries", "all"],
    queryFn: async () => {
      const { extraEntryList, error } = await getExtraEntryList();
      if (error) {
        throw new Error("経理追加収支情報の取得に失敗しました");
      }
      return extraEntryList ?? [];
    },
    initialData: initialData ?? undefined,
    staleTime: 2 * 60 * 1000, // 2分
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
