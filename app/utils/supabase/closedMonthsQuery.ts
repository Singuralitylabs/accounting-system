// 確定済みの月（損益計算書の月次収支確定。Issue #148）の取得クエリ（サーバ専用）。
// 確定済みの月の一覧（getClosedMonths）・経理追加収支の保存前確認・確定後の差分の移動情報・
// 確定後の変更の件数集計（getClosingDiffSummary）で同じクエリを使うためにまとめている。
// "use server" を付けないのは、Server Action としてクライアントへ公開しないため
// （profitLossSource.ts と同じ）。集計元データの取得（profitLossSource.ts）には依存しない。
// profit_loss_closings の SELECT はログインユーザー全員に許可しているため、ロールを問わず取得できる

import type { PostgrestError } from "@supabase/supabase-js";
import { toFirstOfMonth } from "../formatter";
import { createServerSupabase } from "./clients";

export type ClosedMonthsQueryResult =
  | { months: string[]; error?: undefined }
  | { months?: undefined; error: PostgrestError };

// 確定済みの月の一覧（"YYYY-MM" の昇順）。fromMonth（"YYYY-MM"）を渡すと、その月以降の
// 確定済みの月だけを返す（確定後の変更の件数集計の対象期間。Issue #172）
export const fetchClosedMonthKeys = async (options?: {
  fromMonth?: string;
}): Promise<ClosedMonthsQueryResult> => {
  const supabase = createServerSupabase();
  let query = supabase.from("profit_loss_closings").select("target_month");
  if (options?.fromMonth) {
    query = query.gte("target_month", toFirstOfMonth(options.fromMonth));
  }
  const { data, error } = await query.order("target_month", {
    ascending: true,
  });
  if (error) {
    return { error };
  }
  return { months: (data ?? []).map((row) => row.target_month.slice(0, 7)) };
};
