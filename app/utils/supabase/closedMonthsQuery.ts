// 確定済みの月（損益計算書の月次収支確定。Issue #148）の取得クエリ（サーバ専用）。
// 確定済みの月の一覧（getClosedMonths）・経理追加収支の保存前確認・確定後の差分の移動情報で
// 同じクエリを使うためにまとめている。
// "use server" を付けないのは、Server Action としてクライアントへ公開しないため
// （profitLossSource.ts と同じ）。集計元データの取得（profitLossSource.ts）には依存しない。
// profit_loss_closings の SELECT はログインユーザー全員に許可しているため、ロールを問わず取得できる

import type { PostgrestError } from "@supabase/supabase-js";
import { createServerSupabase } from "./clients";

export type ClosedMonthsQueryResult =
  | { months: string[]; error?: undefined }
  | { months?: undefined; error: PostgrestError };

// 確定済みの月の一覧（"YYYY-MM" の昇順）
export const fetchClosedMonthKeys =
  async (): Promise<ClosedMonthsQueryResult> => {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("profit_loss_closings")
      .select("target_month")
      .order("target_month", { ascending: true });
    if (error) {
      return { error };
    }
    return { months: (data ?? []).map((row) => row.target_month.slice(0, 7)) };
  };
