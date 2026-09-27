"use server";

// 確定済みの月の一覧の取得（Issue #148）。経理追加収支画面・定期費用マスタ画面・
// 案件詳細モーダルなど損益計算書以外の画面からも使うため、集計元データの取得
// （profitLossSource.ts）に依存しない軽量なモジュールに分けている

import { AccessFailure } from "../../types/types";
import { fetchClosedMonthKeys } from "./closedMonthsQuery";

export type ClosedMonthsResult =
  | { months: string[]; error?: undefined }
  | { months?: undefined; error: AccessFailure };

// 確定済みの月の一覧（"YYYY-MM" の昇順）。profit_loss_closings の SELECT は
// ログインユーザー全員に許可しているため、ロールを問わず取得できる
// （経理追加収支画面・定期費用マスタ画面の編集ロック / 注記、案件詳細モーダルの注意表示に使う）
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
