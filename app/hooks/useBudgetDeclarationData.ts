import { useQuery } from "@tanstack/react-query";
import {
  getBudgetDeclarationDetail,
  getBudgetDeclarationList,
} from "../utils/supabase/budgetDeclarations";
import {
  BudgetDeclarationDetailType,
  BudgetDeclarationListType,
} from "../types/types";

// 対象月のチーム別申告状況一覧（month: "YYYY-MM"）
export const useBudgetDeclarationList = (
  month: string,
  initialData?: BudgetDeclarationListType | null,
) => {
  return useQuery({
    queryKey: ["budgetDeclarations", "list", month],
    queryFn: async () => {
      const list = await getBudgetDeclarationList(month);
      // null を成功としてキャッシュすると永久にローディング表示になるため、エラーとして扱う
      if (!list) {
        throw new Error("事前収支申告一覧の取得に失敗しました");
      }
      return list;
    },
    // サーバ側の初回取得が失敗（null）した場合はキャッシュせず、クライアントで再取得させる
    initialData: initialData ?? undefined,
    enabled: !!month,
    staleTime: 2 * 60 * 1000, // 2分
  });
};

// 対象月 × チームの申告詳細（明細）。行を開いたときだけ取得する
export const useBudgetDeclarationDetail = (
  month: string,
  team: string | null,
  enabled = true,
) => {
  return useQuery<BudgetDeclarationDetailType | null>({
    queryKey: ["budgetDeclarations", "detail", month, team],
    queryFn: async () => {
      const { detail, error } = await getBudgetDeclarationDetail(month, team!);
      if (error) {
        throw error;
      }
      // 未申告（null）は正常な結果としてキャッシュする
      return detail;
    },
    enabled: enabled && !!month && !!team,
    staleTime: 2 * 60 * 1000, // 2分
  });
};
