// Server-only closed-month queries shared by the closed-month list, the extra-entry pre-save check,
// post-closing move info and getClosingDiffSummary. No "use server" so they are not exposed as
// Server Actions (same as profitLossSource.ts). profit_loss_closings SELECT is open to all logged-in users.

import type { PostgrestError } from "@supabase/supabase-js";
import { toFirstOfMonth } from "../formatter";
import { createServerSupabase } from "./clients";

export type ClosedMonthsQueryResult =
  | { months: string[]; error?: undefined }
  | { months?: undefined; error: PostgrestError };

// Ascending "YYYY-MM"; with fromMonth, only that month and later (summary window).
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
