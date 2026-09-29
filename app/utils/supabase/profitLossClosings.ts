"use server";

import {
  AccessFailure,
  ClosingDiffKey,
  ClosingDiffSelection,
  ClosingDiffSummary,
  ClosingDiffSummaryData,
  ClosingLineInput,
} from "../../types/types";
import { PL_CLOSING_WRITE_CLASSES } from "../permissions";
import { currentJstMonth, toFirstOfMonth } from "../formatter";
import {
  buildLiveMonthLines,
  groupConsecutiveMonths,
  isMonthKey,
} from "../profitLossLogic";
import {
  monthLinesToClosingRows,
  sameClosingRows,
} from "../profitLossClosing";
import {
  buildApplyPayload,
  closingDiffSummaryStartMonth,
  diffClosingLines,
  findStaleSelections,
  liveDiffStates,
  sanitizeDiffKeys,
  sanitizeDiffSelections,
} from "../profitLossDiff";
import { createServerSupabase } from "./clients";
import {
  ClosingSourceRows,
  fetchClosingSourceRows,
  fetchLiveSourceRows,
} from "./profitLossSource";
import { getAuthorizedViewer } from "./viewerAccess";
import { fetchClosedMonthKeys } from "./closedMonthsQuery";

export type ProfitLossClosingWriteResult = { error?: AccessFailure };

// Closes a month. Client-sent amounts are ignored: the server recomputes live lines
// (buildLiveMonthLines) and stores them as the snapshot, via one transaction (save_profit_loss_closing:
// header insert + full line replacement). Write permission is also checked in the DB function.
// Accounting/admin read all rows via RLS, so lines cover all teams. An already-closed month is
// rejected with ALREADY_CLOSED so a stale screen cannot overwrite another accountant's closing/skips.
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
  // Closing lines only need the live rows (no display titles / closing lines).
  const liveClosingRows = async () => {
    const rows = await fetchLiveSourceRows({
      startMonth: month,
      endMonth: month,
    });
    return rows
      ? monthLinesToClosingRows(buildLiveMonthLines({ month, ...rows }))
      : null;
  };
  // With closingId, re-fetches our own closing for post-close verification (not passed for new closings).
  const save = async (
    lines: ClosingLineInput[],
    closingId?: number,
  ): Promise<
    | { closingId: number; failure?: undefined }
    | { failure: "alreadyClosed" | "closingChanged" | "failed" }
  > => {
    const { data, error: rpcError } = await supabase.rpc(
      "save_profit_loss_closing",
      {
        p_target_month: toFirstOfMonth(month),
        p_lines: lines,
        ...(closingId === undefined ? {} : { p_closing_id: closingId }),
      },
    );
    if (rpcError) {
      if (rpcError.message.includes("ALREADY_CLOSED")) {
        return { failure: "alreadyClosed" };
      }
      if (rpcError.message.includes("CLOSING_CHANGED")) {
        return { failure: "closingChanged" };
      }
      console.error("月次収支の確定に失敗しました:", rpcError);
      return { failure: "failed" };
    }
    const savedId = data?.[0]?.id;
    if (typeof savedId !== "number") {
      console.error("月次収支の確定結果を取得できませんでした:", data);
      return { failure: "failed" };
    }
    return { closingId: savedId };
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
  const saved = await save(lines);
  if (saved.failure === "alreadyClosed") {
    return {
      error: {
        kind: "validationFailed",
        message:
          "この月は既に確定されています（別の画面または他の経理担当者による確定）。画面を再読み込みして確定内容を確認してください。",
      },
    };
  }
  if (saved.failure) {
    return {
      error: { kind: "fetchFailed", message: "月次収支の確定に失敗しました。" },
    };
  }

  // Between the aggregation above and the closing commit there is no edit lock yet, so another
  // accountant's adjustment/extra entry saved in that window would be missing from the snapshot (and
  // then locked; extra entries / management-fee adjustments are outside diff detection, so unnoticed). After
  // commit (= locked), aggregate again and re-take the snapshot if anything differs.
  // The closing DB function and the adjustment/extra-entry write triggers are serialized by the same
  // month advisory lock: writes started before closing commit first and are included in the re-aggregation;
  // later writes are rejected as closed.
  const verified = await liveClosingRows();
  if (!verified) {
    // Closing itself is done; only report that verification could not complete.
    return {
      error: {
        kind: "fetchFailed",
        message:
          "確定しましたが、確定直後の確認（確定処理中の他の変更の取り込み）に失敗しました。念のため「確定済み」をオフにしてから再度オンにしてください。",
      },
    };
  }
  if (!sameClosingRows(lines, verified)) {
    const retaken = await save(verified, saved.closingId);
    if (retaken.failure === "closingChanged") {
      // Someone else unclosed/reclosed right after; do not overwrite their closing.
      return {
        error: {
          kind: "validationFailed",
          message:
            "確定直後に他の経理担当者がこの月の確定を解除または確定し直しました。画面を再読み込みして確定内容を確認してください。",
        },
      };
    }
    if (retaken.failure) {
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

// Deletes the header; lines and skip records go by CASCADE. Returns to live view and releases the edit lock.
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
  // RLS-rejected DELETE returns 0 rows without an error, so return deleted rows and check the count.
  const { data: deleted, error: deleteError } = await supabase
    .from("profit_loss_closings")
    .delete()
    .eq("target_month", toFirstOfMonth(month))
    .select("id");
  if (deleteError) {
    console.error("月次収支の確定解除に失敗しました:", deleteError);
    return {
      error: {
        kind: "fetchFailed",
        message: "月次収支の確定解除に失敗しました。",
      },
    };
  }
  if (!deleted || deleted.length === 0) {
    return {
      error: {
        kind: "validationFailed",
        message:
          "この月は確定されていないか、確定を解除する権限がありません。画面を再読み込みして確認してください。",
      },
    };
  }
  return {};
};

// ===== Detect / apply / skip post-closing changes =====

export type ClosingDiffSummaryResult =
  | (ClosingDiffSummaryData & { error?: undefined })
  | { summary?: undefined; fromMonth?: undefined; error: AccessFailure };

// Closed months with pending diffs and counts (banner, month picker, annual trend icon; accounting /
// admin only), limited to the last CLOSING_DIFF_SUMMARY_MONTHS months onward so fetch volume does
// not grow. Fetches live rows, closing lines and skip records per range of consecutive closed
// months in parallel (avoids fetching unclosed months between distant closed months).
export const getClosingDiffSummary =
  async (): Promise<ClosingDiffSummaryResult> => {
    const { profileInfo, error } = await getAuthorizedViewer(
      PL_CLOSING_WRITE_CLASSES,
      "確定後の変更",
    );
    if (!profileInfo) {
      return { error };
    }
    // Included in the result so the UI can note months outside the window.
    const fromMonth = closingDiffSummaryStartMonth(currentJstMonth());
    const { months, error: closedMonthsError } = await fetchClosedMonthKeys({
      fromMonth,
    });
    if (closedMonthsError) {
      console.error("確定済みの月の取得に失敗しました:", closedMonthsError);
      return {
        error: {
          kind: "fetchFailed",
          message: "確定済みの月の取得に失敗しました。",
        },
      };
    }
    if (months.length === 0) {
      return { summary: [], fromMonth };
    }
    const rangeRows = await Promise.all(
      groupConsecutiveMonths(months).map((period) =>
        fetchClosingSourceRows(period),
      ),
    );
    if (rangeRows.some((rows) => !rows)) {
      return {
        error: {
          kind: "fetchFailed",
          message: "確定後の変更の確認に失敗しました。",
        },
      };
    }
    const summary: ClosingDiffSummary = [];
    (rangeRows as ClosingSourceRows[]).forEach((rows) => {
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
    });
    return {
      summary: summary.sort((a, b) => a.month.localeCompare(b.month)),
      fromMonth,
    };
  };

// Shared preprocessing for apply/skip: validation, permission, live aggregation, stale-view check.
const prepareDiffOperation = async (
  month: string,
  selections: ClosingDiffSelection[],
  subject: string,
) => {
  const validSelections = sanitizeDiffSelections(selections);
  if (!isMonthKey(month) || !validSelections) {
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
  const rows = await fetchClosingSourceRows({
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
  const liveLines = buildLiveMonthLines({ month, ...rows });
  // Reject if any line changed since the user's view so unseen changes are not applied/skipped;
  // values always come from the server's recomputation.
  if (findStaleSelections(liveLines, validSelections).length > 0) {
    return {
      error: {
        kind: "validationFailed" as const,
        message:
          "表示した後に案件が更新された明細があります。画面を再読み込みして内容を確認してから操作してください。",
      },
    };
  }
  const keys: ClosingDiffKey[] = validSelections.map(
    ({ sourceType, sourceId }) => ({ sourceType, sourceId }),
  );
  return { keys, liveLines };
};

// Receives only (source_type, source_id) and the viewed state from the client; values come from
// server-side recomputation (existing lines upserted, missing ones deleted from closing lines).
// Records who applied and when.
export const applyClosingDiffs = async (
  month: string,
  selections: ClosingDiffSelection[],
): Promise<ProfitLossClosingWriteResult> => {
  const prepared = await prepareDiffOperation(month, selections, "変更の反映");
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

// Records the live state (server-recomputed) at the time; while unchanged it is excluded from alerts/counts.
export const dismissClosingDiffs = async (
  month: string,
  selections: ClosingDiffSelection[],
): Promise<ProfitLossClosingWriteResult> => {
  const prepared = await prepareDiffOperation(month, selections, "変更の見送り");
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
