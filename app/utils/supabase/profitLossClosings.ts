"use server";

import { AccessFailure } from "../../types/types";
import { PL_CLOSING_WRITE_CLASSES } from "../permissions";
import { toFirstOfMonth } from "../formatter";
import { buildLiveMonthLines, isMonthKey } from "../profitLossLogic";
import { monthLinesToClosingRows } from "../profitLossClosing";
import { createServerSupabase } from "./clients";
import { fetchReportSourceRows } from "./profitLossSource";
import { getAuthorizedViewer } from "./viewerAccess";

export type ClosedMonthsResult =
  | { months: string[]; error?: undefined }
  | { months?: undefined; error: AccessFailure };

// 確定済みの月の一覧（"YYYY-MM" の昇順）。profit_loss_closings の SELECT は
// ログインユーザー全員に許可しているため、ロールを問わず取得できる
// （経理追加収支画面・定期費用マスタ画面の編集ロック / 注記、案件詳細モーダルの注意表示に使う）
export const getClosedMonths = async (): Promise<ClosedMonthsResult> => {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("profit_loss_closings")
    .select("target_month")
    .order("target_month", { ascending: true });
  if (error) {
    console.error("確定済みの月の取得に失敗しました:", error);
    return {
      error: {
        kind: "fetchFailed",
        message: "確定済みの月の取得に失敗しました。",
      },
    };
  }
  return { months: (data ?? []).map((row) => row.target_month.slice(0, 7)) };
};

export type ProfitLossClosingWriteResult = { error?: AccessFailure };

// 月次収支の確定（「確定済み」チェックのオン。再確定も同じ）。
// クライアントから送られた金額は使わず、サーバ側で当月をライブ集計し直した明細を
// スナップショットとして保存する（損益計算書の表示と同じ buildLiveMonthLines）。
// 保存は DB 関数 save_profit_loss_closing（ヘッダの upsert + 明細の全置換）の
// 単一トランザクション。書き込み権限（accounting / admin）は RLS でも担保される。
// 経理担当者・管理者は RLS で全行を読めるため、明細は全チーム分になる
export const closeProfitLossMonth = async (
  month: string,
): Promise<ProfitLossClosingWriteResult> => {
  if (!isMonthKey(month)) {
    return {
      error: { kind: "validationFailed", message: "対象月の形式が不正です。" },
    };
  }
  const { profileInfo, error } = await getAuthorizedViewer(
    PL_CLOSING_WRITE_CLASSES,
    "月次収支の確定",
  );
  if (!profileInfo) {
    return { error };
  }

  const rows = await fetchReportSourceRows({
    startMonth: month,
    endMonth: month,
  });
  if (!rows) {
    return {
      error: {
        kind: "fetchFailed",
        message: "損益計算書のデータ取得に失敗したため確定できませんでした。",
      },
    };
  }
  const lines = buildLiveMonthLines({ month, ...rows });

  const supabase = createServerSupabase();
  const { error: rpcError } = await supabase.rpc("save_profit_loss_closing", {
    p_target_month: toFirstOfMonth(month),
    p_lines: monthLinesToClosingRows(lines),
  });
  if (rpcError) {
    console.error("月次収支の確定に失敗しました:", rpcError);
    return {
      error: { kind: "fetchFailed", message: "月次収支の確定に失敗しました。" },
    };
  }
  return {};
};

// 確定の解除（「確定済み」チェックのオフ）。ヘッダを削除し、明細・見送り記録は
// CASCADE で削除される。ライブ集計の表示に戻り、損益調整・経理追加収支の編集ロックも解ける
export const reopenProfitLossMonth = async (
  month: string,
): Promise<ProfitLossClosingWriteResult> => {
  if (!isMonthKey(month)) {
    return {
      error: { kind: "validationFailed", message: "対象月の形式が不正です。" },
    };
  }
  const { profileInfo, error } = await getAuthorizedViewer(
    PL_CLOSING_WRITE_CLASSES,
    "月次収支の確定解除",
  );
  if (!profileInfo) {
    return { error };
  }

  const supabase = createServerSupabase();
  const { error: deleteError } = await supabase
    .from("profit_loss_closings")
    .delete()
    .eq("target_month", toFirstOfMonth(month));
  if (deleteError) {
    console.error("月次収支の確定解除に失敗しました:", deleteError);
    return {
      error: {
        kind: "fetchFailed",
        message: "月次収支の確定解除に失敗しました。",
      },
    };
  }
  return {};
};
