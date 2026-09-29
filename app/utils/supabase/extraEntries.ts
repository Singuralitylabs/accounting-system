"use server";

import { AccessFailure, ExtraEntryInListType } from "../../types/types";
import {
  buildCopiedExtraEntries,
  toExtraEntryDbRow as toDbRow,
} from "../extraEntry";
import { addMonths, currentJstMonth, isMonthKey } from "../formatter";
import {
  datedOrUndatedFilter,
  reportRangeBounds,
} from "../profitLossLogic";
import {
  CLOSED_MONTH_LOCK_MESSAGE,
  findExtraEntryLockViolations,
  isClosedMonth,
} from "../profitLossClosing";
import { fetchClosedMonthKeys } from "./closedMonthsQuery";
import { fetchAllByIds } from "./paging";
import { createServerSupabase } from "./clients";
import { isMonthClosedError } from "./errorCodes";

// Fetches entries for the target month plus month-undetermined (NULL entry_date) rows, the same
// range as the P&L selected month. RLS returns only permitted rows.
export const getExtraEntryList = async (month: string) => {
  if (!isMonthKey(month)) {
    console.error(`経理追加収支の対象月の形式が不正です: ${month}`);
    return {
      extraEntryList: null,
      error: { message: "対象月の形式が不正です。" },
    };
  }
  const supabase = createServerSupabase();
  const bounds = reportRangeBounds({ startMonth: month, endMonth: month });

  const { data: extraEntryList, error } = await supabase
    .from("extra_entries")
    .select("*")
    .or(datedOrUndatedFilter("entry_date", bounds))
    .order("entry_date", { ascending: false, nullsFirst: true })
    .order("id", { ascending: false });

  if (error) {
    console.error("経理追加収支情報の取得に失敗しました:", error);
  }

  return { extraEntryList, error };
};

const fetchClosedMonths = async () => {
  const { months, error } = await fetchClosedMonthKeys();
  return { closedMonths: new Set(months ?? []), error };
};

export type BulkUpsertExtraEntryResult = { error?: AccessFailure };

const SAVE_FAILED: AccessFailure = {
  kind: "fetchFailed",
  message: "経理追加収支情報の更新に失敗しました。何も保存されていません。",
};

// Bulk create/update/delete. `extraEntries` are only added/removed/edited rows (selectChangedExtraEntries);
// saved rows sent are all treated as updates. Write permission (accounting / admin) is enforced by RLS.
// Closed-month writes (including date moves into/out of a closed month) are also rejected by RLS, but
// a rejected UPDATE / DELETE just updates 0 rows without an error, so check before writing and
// return a clear error without writing anything. Rows already deleted by someone else are rejected too.
// The write is one transaction (save_extra_entries), so a later change never leaves a partial save.
export const bulkUpsertExtraEntry = async (
  extraEntries: ExtraEntryInListType[]
): Promise<BulkUpsertExtraEntryResult> => {
  const supabase = createServerSupabase();

  const existingIds = Array.from(
    new Set(extraEntries.filter((ee) => !ee.isNew).map((ee) => ee.id))
  );
  const [{ closedMonths, error: closingError }, originalResult] =
    await Promise.all([
      fetchClosedMonths(),
      fetchAllByIds(existingIds, (chunk, afterId, limit) =>
        supabase
          .from("extra_entries")
          .select("*")
          .in("id", chunk)
          .gt("id", afterId)
          .order("id", { ascending: true })
          .limit(limit)
      ),
    ]);
  if (closingError || originalResult.error) {
    console.error(
      "経理追加収支の保存前確認に失敗しました:",
      closingError ?? originalResult.error
    );
    return { error: SAVE_FAILED };
  }
  const originals = new Map(
    (originalResult.data ?? []).map((row) => [row.id, row])
  );
  // Updating a row deleted by someone else after load is rejected; deleting one is just dropped from the targets.
  const deletedUpdates = extraEntries.filter(
    (ee) => !ee.isNew && !ee.isRemoved && !originals.has(ee.id)
  );
  if (deletedUpdates.length > 0) {
    return {
      error: {
        kind: "validationFailed",
        message: `編集した行のうち、他の利用者に削除された行があります。画面を再読み込みしてから編集し直してください。（対象: ${deletedUpdates
          .map((ee) => ee.description || "（内容未入力の行）")
          .join("、")}）`,
      },
    };
  }
  const violations = findExtraEntryLockViolations(
    extraEntries,
    originals,
    closedMonths
  );
  if (violations.length > 0) {
    return {
      error: {
        kind: "validationFailed",
        message: `${CLOSED_MONTH_LOCK_MESSAGE}（対象: ${violations.join("、")}）`,
      },
    };
  }

  const newEntries = extraEntries.filter((ee) => ee.isNew && !ee.isRemoved);
  const updateEntries = extraEntries.filter((ee) => !ee.isNew && !ee.isRemoved);
  const deleteEntries = extraEntries.filter(
    (ee) => ee.isRemoved && !ee.isNew && originals.has(ee.id)
  );
  if (
    newEntries.length === 0 &&
    updateEntries.length === 0 &&
    deleteEntries.length === 0
  ) {
    return {};
  }

  // One RPC = one transaction: any failure rolls everything back. RLS still applies (SECURITY INVOKER).
  // NOT_APPLIED when updates/deletes fall short (month closed or row deleted after the pre-check).
  // Adds/date changes into a closed month, and a month closed mid-save (serialized with closing), raise
  // MONTH_CLOSED (42501) from the write trigger.
  const { error: rpcError } = await supabase.rpc("save_extra_entries", {
    p_inserts: newEntries.map(toDbRow),
    p_updates: updateEntries.map((ee) => ({ id: ee.id, ...toDbRow(ee) })),
    p_delete_ids: deleteEntries.map((ee) => ee.id),
  });
  if (rpcError) {
    if (
      rpcError.message.includes("NOT_APPLIED") ||
      rpcError.code === "42501"
    ) {
      return {
        error: {
          kind: "validationFailed",
          message:
            "保存の途中で対象の月が確定されたか、行が他の利用者に変更・削除されたため、何も保存しませんでした。画面を再読み込みしてから保存し直してください。",
        },
      };
    }
    console.error("経理追加収支情報の保存に失敗しました:", rpcError);
    return { error: SAVE_FAILED };
  }

  return {};
};

// Previous month's entries (entry_date within it; NULL rows drop out of the range comparison), used
// for the copy button state, confirmation count and source data.
export const getPreviousMonthExtraEntries = async (month: string) => {
  const supabase = createServerSupabase();
  const previousMonth = addMonths(month, -1);
  const { startDate: rangeStart, endExclusive: rangeEnd } = reportRangeBounds({
    startMonth: previousMonth,
    endMonth: previousMonth,
  });

  const { data: extraEntryList, error } = await supabase
    .from("extra_entries")
    .select("*")
    .gte("entry_date", rangeStart)
    .lt("entry_date", rangeEnd)
    .order("entry_date", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("前月の経理追加収支の取得に失敗しました:", error);
  }

  return { extraEntryList, error };
};

// Copies the given previous-month rows into the current month. Write permission is enforced by RLS.
// Sources are re-fetched by id here rather than trusting the client list:
// (1) reflects edits/deletes made after the confirmation (deleted rows are not copied);
// (2) inserted columns match the buildCopiedExtraEntries allowlist (no caller-chosen columns).
// The query also always constrains to the previous month's date range, so tampered ids outside it
// cannot be copied. Entries identical to ones already in the target month are skipped (double
// clicks, concurrent copies); copy_extra_entries serializes the check and INSERT per target month.
export const copyExtraEntriesFromPreviousMonth = async (
  sourceIds: number[],
  targetMonth: string,
) => {
  // Invalid month keys are a fetch failure, not a silent empty view (same as getProfitLossReport).
  if (!isMonthKey(targetMonth)) {
    console.error(
      `経理追加収支の前月コピーの対象月の形式が不正です: ${targetMonth}`,
    );
    return {
      insertedCount: 0,
      skippedCount: 0,
      error: { message: "対象月の形式が不正です。" },
    };
  }
  if (sourceIds.length === 0) {
    return { insertedCount: 0, skippedCount: 0, error: null };
  }

  // Closed-month copies are also rejected by RLS; return a clear error.
  const { closedMonths, error: closingError } = await fetchClosedMonths();
  if (closingError) {
    console.error("確定済みの月の取得に失敗しました:", closingError);
    return { insertedCount: 0, skippedCount: 0, error: closingError };
  }
  if (isClosedMonth(closedMonths, targetMonth)) {
    return {
      insertedCount: 0,
      skippedCount: 0,
      error: null,
      closedMonthError: CLOSED_MONTH_LOCK_MESSAGE,
    };
  }

  const supabase = createServerSupabase();
  const previousMonth = addMonths(targetMonth, -1);
  const { startDate: previousRangeStart, endExclusive: previousRangeEnd } =
    reportRangeBounds({
      startMonth: previousMonth,
      endMonth: previousMonth,
    });

  const { data: sourceEntries, error: sourceError } = await supabase
    .from("extra_entries")
    .select("*")
    .in("id", sourceIds)
    .gte("entry_date", previousRangeStart)
    .lt("entry_date", previousRangeEnd);

  if (sourceError) {
    console.error("経理追加収支の前月コピー元の取得に失敗しました:", sourceError);
    return { insertedCount: 0, skippedCount: 0, error: sourceError };
  }

  const rows = buildCopiedExtraEntries(sourceEntries ?? [], targetMonth);
  if (rows.length === 0) {
    return { insertedCount: 0, skippedCount: 0, error: null };
  }

  // copy_extra_entries does the existing-row check and INSERT in one transaction, taking an exclusive
  // advisory lock on the target month first, so concurrent copies wait and later ones skip rows
  // already inserted (separate requests could both see "not copied" and double-insert). The
  // duplicate test (type, category, content, owner, team, amount) is also in the function.
  const { data: copyResult, error: copyError } = await supabase.rpc(
    "copy_extra_entries",
    { p_target_month: `${targetMonth}-01`, p_rows: rows },
  );

  // A month closed after the check above (closed-month write / serialization with closing) is
  // reported as a copy into a closed month.
  if (isMonthClosedError(copyError)) {
    return {
      insertedCount: 0,
      skippedCount: 0,
      error: null,
      closedMonthError: CLOSED_MONTH_LOCK_MESSAGE,
    };
  }
  if (copyError) {
    console.error("経理追加収支の前月コピーに失敗しました:", copyError);
    return { insertedCount: 0, skippedCount: 0, error: copyError };
  }

  const counts = copyResult?.[0];
  if (
    !counts ||
    !Number.isInteger(counts.inserted_count) ||
    !Number.isInteger(counts.skipped_count)
  ) {
    // The function always returns one row; anything else is a failure (the copy may have committed, but
    // retrying skips identical rows, and the caller's hook refetches on failure).
    console.error("経理追加収支の前月コピーの結果が不正です:", copyResult);
    return {
      insertedCount: 0,
      skippedCount: 0,
      error: { message: "前月コピーの結果を確認できませんでした。" },
    };
  }

  return {
    insertedCount: counts.inserted_count,
    skippedCount: counts.skipped_count,
    error: null,
  };
};

// Past values for content/billing-party suggestions (last 12 months plus undetermined), fetched
// separately because the list shows only the target month. Failures fall back to an empty array
// in the caller (auxiliary display).
export const getExtraEntrySuggestions = async () => {
  const supabase = createServerSupabase();
  const currentMonth = currentJstMonth();
  const bounds = reportRangeBounds({
    startMonth: addMonths(currentMonth, -11),
    endMonth: currentMonth,
  });

  const { data: suggestionList, error } = await supabase
    .from("extra_entries")
    .select("description,billing_target")
    .or(datedOrUndatedFilter("entry_date", bounds))
    .order("entry_date", { ascending: false, nullsFirst: false })
    .limit(1000);

  if (error) {
    console.error(
      "経理追加収支のサジェスト候補の取得に失敗しました:",
      error,
    );
  }

  return { suggestionList, error };
};
