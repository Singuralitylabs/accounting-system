"use server";

import {
  AccessFailure,
  ClosingDiffKey,
  ClosingDiffSummary,
  ClosingLineInput,
} from "../../types/types";
import { PL_CLOSING_WRITE_CLASSES } from "../permissions";
import { toFirstOfMonth } from "../formatter";
import { buildLiveMonthLines, isMonthKey } from "../profitLossLogic";
import {
  monthLinesToClosingRows,
  sameClosingRows,
} from "../profitLossClosing";
import {
  buildApplyPayload,
  diffClosingLines,
  liveDiffStates,
  sanitizeDiffKeys,
} from "../profitLossDiff";
import { createServerSupabase } from "./clients";
import { fetchReportSourceRows } from "./profitLossSource";
import { getAuthorizedViewer } from "./viewerAccess";
import { getClosedMonths } from "./profitLossClosedMonths";

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

  const supabase = createServerSupabase();
  const liveClosingRows = async () => {
    const rows = await fetchReportSourceRows({
      startMonth: month,
      endMonth: month,
    });
    return rows
      ? monthLinesToClosingRows(buildLiveMonthLines({ month, ...rows }))
      : null;
  };
  const save = async (lines: ClosingLineInput[]) => {
    const { error: rpcError } = await supabase.rpc("save_profit_loss_closing", {
      p_target_month: toFirstOfMonth(month),
      p_lines: lines,
    });
    if (rpcError) {
      console.error("月次収支の確定に失敗しました:", rpcError);
    }
    return !rpcError;
  };

  const lines = await liveClosingRows();
  if (!lines) {
    return {
      error: {
        kind: "fetchFailed",
        message: "損益計算書のデータ取得に失敗したため確定できませんでした。",
      },
    };
  }
  if (!(await save(lines))) {
    return {
      error: { kind: "fetchFailed", message: "月次収支の確定に失敗しました。" },
    };
  }

  // 集計（上の取得）から確定のコミットまでの間は、まだ編集ロックが掛かっていないため、
  // 他の経理担当者が当月の損益調整・経理追加収支を保存するとスナップショットから漏れる
  // （しかも以後ロックされ、定期費用・経理追加収支は変更検知の対象外で気付けない）。
  // 確定のコミット後（= ロック後）にもう一度集計し、違いがあれば取り直して確定値に含める
  const verified = await liveClosingRows();
  if (verified && !sameClosingRows(lines, verified)) {
    if (!(await save(verified))) {
      return {
        error: {
          kind: "fetchFailed",
          message:
            "確定中に他の変更があったため確定値を取り直そうとしましたが失敗しました。「確定済み」をオフにしてから再度オンにしてください。",
        },
      };
    }
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

// ===== 確定後の変更の検知・反映・見送り（Issue #149） =====

export type ClosingDiffSummaryResult =
  | { summary: ClosingDiffSummary; error?: undefined }
  | { summary?: undefined; error: AccessFailure };

// 未処理の差分がある確定済みの月と件数（損益計算書ページ上部のバナー・月ピッカー・
// 年間推移のアイコン用。accounting / admin のみ）。
// 確定済みの月の一覧を取得したうえで、その範囲のライブの行・確定明細・見送り記録を
// 1 回の一括取得（fetchReportSourceRows の Promise.all）で取得し、月別に差分を数える
export const getClosingDiffSummary =
  async (): Promise<ClosingDiffSummaryResult> => {
    const { profileInfo, error } = await getAuthorizedViewer(
      PL_CLOSING_WRITE_CLASSES,
      "確定後の変更",
    );
    if (!profileInfo) {
      return { error };
    }
    const closedMonthsResult = await getClosedMonths();
    if (closedMonthsResult.error) {
      return { error: closedMonthsResult.error };
    }
    const months = closedMonthsResult.months;
    if (months.length === 0) {
      return { summary: [] };
    }
    const rows = await fetchReportSourceRows({
      startMonth: months[0],
      endMonth: months[months.length - 1],
    });
    if (!rows) {
      return {
        error: {
          kind: "fetchFailed",
          message: "確定後の変更の確認に失敗しました。",
        },
      };
    }
    const summary: ClosingDiffSummary = [];
    rows.closings.forEach((closing, month) => {
      const { pending } = diffClosingLines({
        liveLines: buildLiveMonthLines({ month, ...rows }),
        closedLines: closing.lines,
        dismissals: closing.dismissals,
      });
      if (pending.length > 0) {
        summary.push({ month, count: pending.length });
      }
    });
    return { summary: summary.sort((a, b) => a.month.localeCompare(b.month)) };
  };

// 反映・見送りの共通の前処理（入力検証・権限確認・当月のライブ集計）
const prepareDiffOperation = async (
  month: string,
  keys: ClosingDiffKey[],
  subject: string,
) => {
  const validKeys = sanitizeDiffKeys(keys);
  if (!isMonthKey(month) || !validKeys) {
    return {
      error: {
        kind: "validationFailed" as const,
        message: "対象の指定が不正です。",
      },
    };
  }
  const { profileInfo, error } = await getAuthorizedViewer(
    PL_CLOSING_WRITE_CLASSES,
    subject,
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
        kind: "fetchFailed" as const,
        message: `${subject}のためのデータ取得に失敗しました。`,
      },
    };
  }
  if (!rows.closings.has(month)) {
    return {
      error: {
        kind: "validationFailed" as const,
        message: "この月は確定されていません。画面を再読み込みしてください。",
      },
    };
  }
  return { keys: validKeys, liveLines: buildLiveMonthLines({ month, ...rows }) };
};

// 選択した差分の反映。クライアントからは対象の明細（source_type, source_id）だけを
// 受け取り、値はサーバ側でライブ集計し直したものを使う（ライブにある明細は最新の値で
// upsert、無い明細は確定明細から削除）。反映者・反映日時を記録する
export const applyClosingDiffs = async (
  month: string,
  keys: ClosingDiffKey[],
): Promise<ProfitLossClosingWriteResult> => {
  const prepared = await prepareDiffOperation(month, keys, "変更の反映");
  if (prepared.error) {
    return { error: prepared.error };
  }
  const { upsertLines, deleteKeys } = buildApplyPayload(
    prepared.liveLines,
    prepared.keys,
  );
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc("apply_profit_loss_closing_diffs", {
    p_target_month: toFirstOfMonth(month),
    p_upsert_lines: monthLinesToClosingRows(upsertLines),
    p_delete_keys: deleteKeys,
  });
  if (error) {
    console.error("確定後の変更の反映に失敗しました:", error);
    return {
      error: { kind: "fetchFailed", message: "変更の反映に失敗しました。" },
    };
  }
  return {};
};

// 選択した差分の見送り。その時点のライブの状態（サーバ側で集計し直した値）を記録し、
// 以後その状態のままならアラート・件数から外す
export const dismissClosingDiffs = async (
  month: string,
  keys: ClosingDiffKey[],
): Promise<ProfitLossClosingWriteResult> => {
  const prepared = await prepareDiffOperation(month, keys, "変更の見送り");
  if (prepared.error) {
    return { error: prepared.error };
  }
  const supabase = createServerSupabase();
  const { error } = await supabase.rpc("dismiss_profit_loss_closing_diffs", {
    p_target_month: toFirstOfMonth(month),
    p_dismissals: liveDiffStates(prepared.liveLines, prepared.keys).map(
      (state) => ({
        source_type: state.sourceType,
        source_id: state.sourceId,
        live_present: state.present,
        live_actual_amount: state.actualAmount,
        live_team: state.team,
        live_category: state.category,
      }),
    ),
  });
  if (error) {
    console.error("確定後の変更の見送りに失敗しました:", error);
    return {
      error: { kind: "fetchFailed", message: "変更の見送りに失敗しました。" },
    };
  }
  return {};
};

// 見送りの取り消し（未処理の差分に戻す）
export const undoClosingDismissals = async (
  month: string,
  keys: ClosingDiffKey[],
): Promise<ProfitLossClosingWriteResult> => {
  const validKeys = sanitizeDiffKeys(keys);
  if (!isMonthKey(month) || !validKeys) {
    return {
      error: { kind: "validationFailed", message: "対象の指定が不正です。" },
    };
  }
  const { profileInfo, error } = await getAuthorizedViewer(
    PL_CLOSING_WRITE_CLASSES,
    "見送りの取り消し",
  );
  if (!profileInfo) {
    return { error };
  }
  const supabase = createServerSupabase();
  const { error: rpcError } = await supabase.rpc(
    "undo_profit_loss_closing_dismissals",
    {
      p_target_month: toFirstOfMonth(month),
      p_keys: validKeys.map((key) => ({
        source_type: key.sourceType,
        source_id: key.sourceId,
      })),
    },
  );
  if (rpcError) {
    console.error("見送りの取り消しに失敗しました:", rpcError);
    return {
      error: { kind: "fetchFailed", message: "見送りの取り消しに失敗しました。" },
    };
  }
  return {};
};
