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

// 経理追加収支の一括登録・更新・削除
export const useUpsertExtraEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (extraEntries: ExtraEntryInListType[]) =>
      bulkUpsertExtraEntry(extraEntries),
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
// 件数表示用）。月次タブを開くたび最新化する（refetchOnMount: "always"）。
// 他画面での編集・削除後に古いキャッシュのまま「コピーできる」と誤表示するのを避ける
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

// 前月分の経理追加収支を当月分として一括複製する
export const useCopyExtraEntriesFromPreviousMonth = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (month: string) => {
      const { insertedCount, error } =
        await copyExtraEntriesFromPreviousMonth(month);
      if (error) {
        throw new Error("経理追加収支の前月コピーに失敗しました");
      }
      return insertedCount;
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
