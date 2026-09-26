// 損益計算書の月次収支確定（Issue #148）の純粋関数。
// 確定明細（profit_loss_closing_lines）⇔ 明細行（PLMonthLines）の変換、
// 確定済みの月の判定と編集可否の判定を行う。Supabase アクセスは
// app/utils/supabase/profitLossClosings.ts / profitLossReport.ts が行う。

import {
  ClosingInfo,
  ClosingLineInput,
  PLMonthLines,
  PLReportType,
  ProfitLossClosingDismissalType,
  ProfitLossClosingLineType,
  ProfitLossClosingType,
  RecurringCostType,
} from "../types/types";
import { diffClosingLines } from "./profitLossDiff";
import { formatMonthLabel } from "./formatter";
import {
  BusinessRow,
  CostRow,
  MonthlyReportInput,
  aggregateMonthLines,
  buildLabelIndex,
  buildLiveMonthLines,
  computeOrphanedAdjustments,
  computeUndated,
} from "./profitLossLogic";

const toMonthKey = (value: string): string => value.slice(0, 7);

// 明細行（ライブ集計の結果）を確定明細の保存形式に変換する。
// 実績額・調整額・調整理由を含めて保存し、確定後に調整・元データが変わっても
// 確定値は変わらないようにする
export const monthLinesToClosingRows = (
  lines: PLMonthLines,
): ClosingLineInput[] => {
  const empty = {
    matter_id: null,
    matter_title: null,
    category: null,
    item: null,
    team: null,
    entry_type: null,
    entry_date: null,
    payment_cycle: null,
    source_amount: null,
    adjustment_amount: null,
    actual_amount: null,
    adjustment_reason: null,
    billing_amount: null,
    expense_amount: null,
  };
  return [
    ...lines.businesses.map((line) => ({
      ...empty,
      source_type: "business",
      source_id: line.businessId,
      matter_id: line.matterId,
      matter_title: line.matterTitle,
      name: line.name,
      category: line.category,
      team: line.team,
      source_amount: line.sourceAmount,
      adjustment_amount: line.adjustmentAmount,
      actual_amount: line.actualAmount,
      adjustment_reason: line.adjustmentReason,
    })),
    ...lines.costs.map((line) => ({
      ...empty,
      source_type: "cost",
      source_id: line.costId,
      matter_id: line.matterId,
      matter_title: line.matterTitle,
      name: line.name,
      category: line.category,
      item: line.item,
      team: line.team,
      source_amount: line.sourceAmount,
      adjustment_amount: line.adjustmentAmount,
      actual_amount: line.actualAmount,
      adjustment_reason: line.adjustmentReason,
    })),
    ...lines.recurringCosts.map((line) => ({
      ...empty,
      source_type: "recurring_cost",
      source_id: line.recurringCostId,
      name: line.name,
      item: line.item,
      team: line.team,
      payment_cycle: line.paymentCycle,
      source_amount: line.sourceAmount,
      adjustment_amount: line.adjustmentAmount,
      actual_amount: line.actualAmount,
      adjustment_reason: line.adjustmentReason,
    })),
    ...lines.extraEntries.map((entry) => ({
      ...empty,
      source_type: "extra_entry",
      source_id: entry.extraEntryId,
      name: entry.description,
      category: entry.category,
      team: entry.team,
      entry_type: entry.entryType,
      entry_date: entry.entryDate,
      billing_amount: entry.billingAmount,
      expense_amount: entry.expenseAmount,
    })),
  ];
};

// 確定明細の金額（numeric）は PostgREST から number で返るが、NULL 許容の列のため
// 種別ごとに必須の列は CHECK 制約で NOT NULL が担保されている
const amount = (value: number | null): number => Number(value ?? 0);

const snapshotAdjustable = (row: ClosingLineInput) => ({
  sourceAmount: amount(row.source_amount),
  adjustmentAmount: amount(row.adjustment_amount),
  actualAmount: amount(row.actual_amount),
  // 確定値は元データの変更を追従しないため、元データ変更の警告は出さない
  // （確定後の変更は Issue #149 の差分として検知する）
  sourceChanged: false,
  adjustment: null,
  adjustmentReason: row.adjustment_reason,
});

const bySourceId = (a: { source_id: number }, b: { source_id: number }) =>
  a.source_id - b.source_id;

// 確定明細を明細行（集計の入力）に戻す。ライブ集計と同じ aggregateMonthLines で
// 集計するため、確定済みの月もライブの月と同じ形の損益計算書になる
export const closingRowsToMonthLines = (
  rows: ClosingLineInput[],
): PLMonthLines => {
  const sorted = [...rows].sort(bySourceId);
  return {
    businesses: sorted
      .filter((row) => row.source_type === "business")
      .map((row) => ({
        ...snapshotAdjustable(row),
        businessId: row.source_id,
        name: row.name,
        matterId: row.matter_id ?? 0,
        matterTitle: row.matter_title ?? "",
        category: row.category ?? "",
        team: row.team ?? "",
      })),
    costs: sorted
      .filter((row) => row.source_type === "cost")
      .map((row) => ({
        ...snapshotAdjustable(row),
        costId: row.source_id,
        name: row.name,
        item: row.item ?? "",
        matterId: row.matter_id ?? 0,
        matterTitle: row.matter_title ?? "",
        category: row.category ?? "",
        team: row.team ?? "",
      })),
    recurringCosts: sorted
      .filter((row) => row.source_type === "recurring_cost")
      .map((row) => ({
        ...snapshotAdjustable(row),
        recurringCostId: row.source_id,
        name: row.name,
        item: row.item ?? "",
        team: row.team,
        paymentCycle: row.payment_cycle ?? "monthly",
      })),
    extraEntries: sorted
      .filter((row) => row.source_type === "extra_entry")
      .map((row) => ({
        extraEntryId: row.source_id,
        entryType: row.entry_type ?? "expense",
        category: row.category ?? "",
        description: row.name,
        team: row.team,
        entryDate: row.entry_date,
        billingAmount:
          row.billing_amount === null ? null : Number(row.billing_amount),
        expenseAmount:
          row.expense_amount === null ? null : Number(row.expense_amount),
      })),
  };
};

// 確定済みの月の名称（案件名・取引先名・コスト名・定期費用名）を最新の元データに
// 差し替える。名称は金額・集計に影響しないため確定の対象外とし、常に最新を表示する
// （Issue #149 / #150）。元の行が取得範囲に無い（削除済み・他月へ移動）場合は
// 確定明細に保存した名称のまま。分類・チーム・金額は確定値のまま変えない
export const refreshSnapshotNames = (
  lines: PLMonthLines,
  live: {
    businessRows: BusinessRow[];
    costRows: CostRow[];
    recurringCosts: RecurringCostType[];
  },
): PLMonthLines => {
  const businessById = new Map(live.businessRows.map((row) => [row.id, row]));
  const costById = new Map(live.costRows.map((row) => [row.id, row]));
  const recurringById = new Map(live.recurringCosts.map((rc) => [rc.id, rc]));
  // 案件名は同じ案件の他の明細から引けることもあるため、案件単位の索引も作る
  const matterTitleById = new Map<number, string>();
  [...live.businessRows, ...live.costRows].forEach((row) =>
    matterTitleById.set(row.matter_id, row.matters.title),
  );
  return {
    ...lines,
    businesses: lines.businesses.map((line) => ({
      ...line,
      name: businessById.get(line.businessId)?.name ?? line.name,
      matterTitle: matterTitleById.get(line.matterId) ?? line.matterTitle,
    })),
    costs: lines.costs.map((line) => ({
      ...line,
      name: costById.get(line.costId)?.name ?? line.name,
      matterTitle: matterTitleById.get(line.matterId) ?? line.matterTitle,
    })),
    recurringCosts: lines.recurringCosts.map((line) => ({
      ...line,
      name: recurringById.get(line.recurringCostId)?.name ?? line.name,
    })),
  };
};

// 確定ヘッダ → 画面表示用の確定情報
export const toClosingInfo = (
  closing: Pick<
    ProfitLossClosingType,
    | "target_month"
    | "closed_at"
    | "closed_by_name"
    | "refreshed_at"
    | "refreshed_by_name"
  >,
): ClosingInfo => ({
  month: toMonthKey(closing.target_month),
  closedAt: closing.closed_at,
  closedByName: closing.closed_by_name,
  refreshedAt: closing.refreshed_at,
  refreshedByName: closing.refreshed_by_name,
});

// ===== 確定済みの月の判定・編集可否 =====

// 確定済みの月キー（"YYYY-MM"）の集合
export const toClosedMonthSet = (
  closings: Pick<ProfitLossClosingType, "target_month">[],
): Set<string> =>
  new Set(closings.map((closing) => toMonthKey(closing.target_month)));

// 日付（"YYYY-MM-DD"）または月キーの属する月が確定済みか。NULL（日付未入力）は false
export const isClosedMonth = (
  closedMonths: ReadonlySet<string>,
  dateOrMonth: string | null | undefined,
): boolean => !!dateOrMonth && closedMonths.has(toMonthKey(dateOrMonth));

// 経理追加収支の保存可否（確定中の編集ロック）。
// 変更前の日付（新規は undefined）・変更後の日付のどちらかが確定済みの月なら不可
// （確定済みの月へ / からの日付の移動を含む）。削除は変更後の日付を渡さない
export const canWriteExtraEntry = (
  closedMonths: ReadonlySet<string>,
  originalDate: string | null | undefined,
  nextDate: string | null | undefined,
): boolean =>
  !isClosedMonth(closedMonths, originalDate) &&
  !isClosedMonth(closedMonths, nextDate);

// 経理追加収支の一括保存で、確定中の編集ロックに抵触する行の内容（表示用）を返す。
// 新規行は変更後の日付、削除行は変更前の日付、更新行は変更前・変更後の両方を判定する。
// originalDates は保存前の DB 上の entry_date（id → 日付）
export const findExtraEntryLockViolations = (
  entries: {
    id: number;
    isNew?: boolean;
    isRemoved?: boolean;
    entry_date: string | null;
    description: string;
  }[],
  originalDates: ReadonlyMap<number, string | null>,
  closedMonths: ReadonlySet<string>,
): string[] =>
  entries
    .filter((entry) => {
      if (entry.isNew && entry.isRemoved) return false; // 未保存の行の取り消し
      if (entry.isNew) {
        return !canWriteExtraEntry(closedMonths, undefined, entry.entry_date);
      }
      const originalDate = originalDates.get(entry.id);
      if (entry.isRemoved) {
        return isClosedMonth(closedMonths, originalDate);
      }
      return !canWriteExtraEntry(closedMonths, originalDate, entry.entry_date);
    })
    .map((entry) => entry.description || "（内容未入力の行）");

// 定期費用マスタの適用期間に含まれる確定済みの月（昇順）。
// 定期費用の変更は確定済みの月には反映されないため、編集ダイアログで注記する
export const closedMonthsInRecurringRange = (
  recurringCost: Pick<RecurringCostType, "start_month" | "end_month">,
  closedMonths: ReadonlySet<string>,
): string[] => {
  const start = toMonthKey(recurringCost.start_month);
  const end = recurringCost.end_month
    ? toMonthKey(recurringCost.end_month)
    : null;
  return Array.from(closedMonths)
    .filter((month) => start <= month && (end === null || month <= end))
    .sort();
};

// 案件の開始日（保存済み・入力中）のうち、確定済みの月に当たるもの（重複なし・昇順）。
// 案件詳細モーダルの注意表示（Issue #149）に使う
export const closedMonthsForMatter = (
  closedMonths: ReadonlySet<string>,
  startDates: (string | null | undefined)[],
): string[] =>
  Array.from(
    new Set(
      startDates
        .filter((date): date is string => isClosedMonth(closedMonths, date))
        .map(toMonthKey),
    ),
  ).sort();

// 確定中の編集ロックの案内（損益計算書・経理追加収支画面のツールチップ共通）
export const CLOSED_MONTH_LOCK_MESSAGE =
  "確定済みの月です。編集するには損益計算書で『確定済み』をオフにしてください";

// 確定済みの月の一覧表示（「2026年8月 / 2026年9月」）
export const formatClosedMonths = (months: string[]): string =>
  months.map(formatMonthLabel).join(" / ");

// 確定明細の行（DB から取得した形）を保存形式と同じ形に揃える（id / closing_id を除く）
export const stripClosingLineIds = (
  rows: ProfitLossClosingLineType[],
): ClosingLineInput[] =>
  rows.map((row) => {
    const { id: _id, closing_id: _closingId, ...rest } = row;
    return rest;
  });

// 確定済みの月のスナップショット（ヘッダ＋明細）
export type MonthClosingSnapshot = {
  header: Pick<
    ProfitLossClosingType,
    | "target_month"
    | "closed_at"
    | "closed_by_name"
    | "refreshed_at"
    | "refreshed_by_name"
  >;
  lines: ClosingLineInput[];
  // 見送り記録（Issue #149。RLS により accounting / admin のみ取得できる）
  dismissals: ProfitLossClosingDismissalType[];
};

// 指定月の損益レポートを組み立てる。確定済みの月（closing あり）は確定明細から、
// 未確定の月はライブ集計から集計する（Issue #148）。
// 月未確定（undated）と対象行が当月に存在しない調整（orphanedAdjustments）は、
// 確定済みの月でも常にライブの行から計算する（「月未確定」枠は確定の対象外）
export const buildMonthReport = (
  input: MonthlyReportInput & { closing?: MonthClosingSnapshot | null },
): PLReportType => {
  const liveLines = buildLiveMonthLines(input);
  const lines = input.closing
    ? refreshSnapshotNames(closingRowsToMonthLines(input.closing.lines), input)
    : liveLines;
  const report = aggregateMonthLines({
    month: input.month,
    lines,
    isTeamLeader: input.isTeamLeader,
    includeTeamBreakdown: input.includeTeamBreakdown,
    teamOrder: input.teamOrder,
    labels: input.labels,
  });
  return {
    ...report,
    undated: computeUndated(
      input.businessRows,
      input.costRows,
      input.extraEntries,
    ),
    orphanedAdjustments:
      input.includeTeamBreakdown && input.includeOrphanedAdjustments
        ? computeOrphanedAdjustments(
            input.month,
            liveLines,
            input.adjustments,
            input.businessRows,
            input.costRows,
            input.recurringCosts,
            buildLabelIndex(input.labels),
          )
        : undefined,
    closing: input.closing ? toClosingInfo(input.closing.header) : null,
    // 確定後の案件の変更（Issue #149）。差分・反映・見送りを操作するロール
    // （includeTeamBreakdown = accounting / admin）にのみ含める
    closingDiffs:
      input.closing && input.includeTeamBreakdown
        ? diffClosingLines({
            liveLines,
            closedLines: input.closing.lines,
            dismissals: input.closing.dismissals,
            labelIndex: buildLabelIndex(input.labels),
          })
        : undefined,
  };
};
