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

// 経理追加収支一覧の取得（RLS により権限に応じた行のみ返る）。
// 対象月のエントリ（entry_date が対象月に属する行）と月未確定（entry_date が
// NULL）の行だけを取得する（「期間内 OR NULL」。損益計算書の選択月の明細と同じ範囲）。
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

// 確定済みの月（損益計算書の月次収支確定。Issue #148）の集合を取得する
const fetchClosedMonths = async () => {
  const { months, error } = await fetchClosedMonthKeys();
  return { closedMonths: new Set(months ?? []), error };
};

export type BulkUpsertExtraEntryResult = { error?: AccessFailure };

const SAVE_FAILED: AccessFailure = {
  kind: "fetchFailed",
  message: "経理追加収支情報の更新に失敗しました。何も保存されていません。",
};

// 経理追加収支の一括登録・更新・削除。
// extraEntries は追加・削除・編集した行のみ（画面側で selectChangedExtraEntries により選ぶ）。
// 送られた保存済みの行はすべて更新対象として扱う。
// 書き込み権限（accounting / admin のみ）は RLS で担保される。
// 確定済みの月（Issue #148）のエントリの追加・更新・削除、確定済みの月へ / からの
// 日付の変更は RLS でも拒否されるが、UPDATE / DELETE は RLS で拒否されると 0 行更新に
// なるだけでエラーにならない（黙って保存されない）ため、書き込み前にここで判定し、
// 1 件でも該当すれば何も書き込まずに分かりやすいエラーを返す。
// 更新する行が既に削除されていた（画面の読み込み後に他の利用者が削除した）場合も、
// 書き込み前に拒否する。書き込みは save_extra_entries（1 トランザクション）で行うため、
// 確認の後に状況が変わって失敗しても、一部だけ保存された状態は残らない
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
  // 読み込み後に他の利用者が削除した行の更新は拒否する（削除は既に目的を果たしているため
  // 対象から外すだけにする）
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

  // 新規作成用
  const newEntries = extraEntries.filter((ee) => ee.isNew && !ee.isRemoved);
  // 更新用
  const updateEntries = extraEntries.filter((ee) => !ee.isNew && !ee.isRemoved);
  // 削除用（既に削除されている行は除く）
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

  // 追加・更新・削除を 1 回の RPC（= 1 トランザクション）で行う。途中で 1 件でも失敗すれば
  // すべてロールバックされ、一部だけ保存された状態は残らない。
  // RLS はそのまま効く（SECURITY INVOKER）。保存前の確認の後に月が確定された・行が削除された
  // 等で更新・削除が指定件数に満たない場合は NOT_APPLIED、追加・日付の変更が確定済みの月に
  // 当たる場合と、保存の途中で同じ月が確定された場合（確定との直列化。Issue #171）は
  // 書き込みのトリガーの MONTH_CLOSED（42501）になる
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

// 対象月の前月分の経理追加収支を取得する（損益計算書 月次タブの
// 「前月の経理追加収支をコピー」ボタン用。ボタンの活性判定・確認ダイアログの
// 件数表示・複製元データの取得を兼ねる）。entry_date が前月内の行のみ返す
// （NULL＝月未確定の明細は範囲比較で自動的に除外される）
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

// 前月分の経理追加収支（sourceIds で指定した行）を当月分として一括複製する
// （「前月の経理追加収支をコピー」ボタン用）。書き込み権限（accounting / admin
// のみ）は RLS で担保される。
//
// 確認ダイアログでは呼び出し側がクライアント取得済みの一覧から件数・対象月を
// 表示するが、複製元は id 指定でここで改めて取得し直す。これにより、
// (1) 確認から実行までの間に他の利用者が編集・削除した内容を反映できる
//     （削除済みの行は select に含まれず複製されない）、
// (2) INSERT する列を buildCopiedExtraEntries のホワイトリストに揃えられる
//     （呼び出し側が任意の列を指定できる経路を作らない）。
// 取得クエリには sourceIds に加えて前月の日付範囲も必ず付与する。改変された
// リクエストで前月以外の id を渡されても、対象は前月分に限定され、
// 「前月コピー」という機能の前提から外れた複製ができないようにする。
// さらに、当月に既に同一内容の明細がある場合は二重コピーとみなしスキップする
// （確認ダイアログを見逃した連続クリック・複数の経理担当による同時コピー対策。
// 確認と INSERT は copy_extra_entries が対象月ごとに直列化して行う）。
export const copyExtraEntriesFromPreviousMonth = async (
  sourceIds: number[],
  targetMonth: string,
) => {
  // 不正な月キーは沈黙の空表示にせず取得失敗として扱う（getProfitLossReport と同方針）
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

  // 確定済みの月（Issue #148）へのコピーは RLS でも拒否されるが、分かりやすいエラーにする
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

  // 当月の既存行の確認から INSERT までを copy_extra_entries（1 トランザクション）で行う。
  // 関数の中で対象月の排他 advisory lock を取ってから既存行を確認するため、同じ月へのコピーが
  // 同時に走っても後のコピーは先のコピーのコミットを待ち、先に登録された行を同一内容として
  // スキップする（別々のリクエストで確認と INSERT をしていた頃は、両方が「未コピー」と判断して
  // 二重に登録し得た）。同一内容の判定（区分・分類・内容・責任者・チーム・金額）も関数側で行う
  const { data: copyResult, error: copyError } = await supabase.rpc(
    "copy_extra_entries",
    { p_target_month: `${targetMonth}-01`, p_rows: rows },
  );

  // 上の確認の後に対象月が確定された場合（確定済みの月への書き込み・確定との直列化で
  // 拒否された場合。Issue #171）は、確定済みの月へのコピーとして分かりやすいエラーにする
  if (copyError?.message.includes("MONTH_CLOSED")) {
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
    // 関数は常に 1 行を返す。想定外の応答は件数を表示できないため失敗として扱う
    // （コピーはコミット済みの可能性があるが、やり直しても同一内容の行はスキップされる。
    // 呼び出し側のフックは失敗時も一覧を取り直す）
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

// 内容・請求先のサジェスト用の過去の入力値を取得する（直近12ヶ月＋月未確定分。
// 一覧は対象月だけを表示するため、他の月の過去入力も候補に出るよう別に取得する）。
// 新しい月の行が 0 件でも先月までの入力値が候補に出る（4.19.3）。
// 補助的な表示のため、取得に失敗しても呼び出し側で空配列にフォールバックする
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
