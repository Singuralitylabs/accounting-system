import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bulkUpsertExtraEntry } from "../utils/supabase/extraEntries";
import { fetchExtraEntryList } from "../utils/supabase/clientQueries";
import { ExtraEntryInListType, ExtraEntryType } from "../types/types";

// 経理追加収支一覧
// （読み取りはクライアントから Supabase に直接クエリする。clientQueries.ts 参照）
export const useExtraEntryList = (initialData?: ExtraEntryType[] | null) => {
  return useQuery({
    queryKey: ["extraEntries", "all"],
    queryFn: () => fetchExtraEntryList(),
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
