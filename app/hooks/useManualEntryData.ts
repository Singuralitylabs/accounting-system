import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getManualEntryList,
  bulkUpsertManualEntry,
} from "../utils/supabase/manualEntries";
import { ManualEntryInListType } from "../types/types";

// 対象月（month: "YYYY-MM"）の案件外収支一覧
export const useManualEntryList = (month: string, enabled = true) => {
  return useQuery({
    queryKey: ["manualEntries", month],
    queryFn: async () => {
      const { manualEntryList, error } = await getManualEntryList(month);
      if (error) {
        throw new Error("案件外収支情報の取得に失敗しました");
      }
      return manualEntryList ?? [];
    },
    enabled: enabled && !!month,
    staleTime: 2 * 60 * 1000, // 2分
  });
};

// 案件外収支の一括登録・更新・削除
export const useUpsertManualEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      month,
      manualEntries,
    }: {
      month: string;
      manualEntries: ManualEntryInListType[];
    }) => bulkUpsertManualEntry(month, manualEntries),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manualEntries"] });
      // 案件外収支の変更は月次・年間推移の損益レポートに影響するため、損益側もまとめて無効化する
      queryClient.invalidateQueries({ queryKey: ["profitLoss"] });
    },
    onError: (error) => {
      console.error("案件外収支更新エラー:", error);
    },
  });
};
