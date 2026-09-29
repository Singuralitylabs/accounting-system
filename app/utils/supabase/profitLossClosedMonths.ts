"use server";

// Kept as a light module independent of profitLossSource.ts because non-P&L screens (extra entries,
// recurring costs, matter detail modal) also use it.

import { AccessFailure } from "../../types/types";
import { fetchClosedMonthKeys } from "./closedMonthsQuery";

export type ClosedMonthsResult =
  | { months: string[]; error?: undefined }
  | { months?: undefined; error: AccessFailure };

// Ascending "YYYY-MM". profit_loss_closings SELECT is open to all logged-in users.
export const getClosedMonths = async (): Promise<ClosedMonthsResult> => {
  const { months, error } = await fetchClosedMonthKeys();
  if (error) {
    console.error("確定済みの月の取得に失敗しました:", error);
    return {
      error: {
        kind: "fetchFailed",
        message: "確定済みの月の取得に失敗しました。",
      },
    };
  }
  return { months };
};
