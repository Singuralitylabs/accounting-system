// Pure functions for monthly closing: convert closing lines <-> PLMonthLines and decide whether a
// month is closed/editable. Supabase access lives in supabase/profitLossClosings.ts / profitLossReport.ts.

import {
  ClosingInfo,
  ClosingLineInput,
  ExtraEntryInListType,
  OrphanedAdjustmentType,
  ExtraEntryType,
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
  needsMonthlyAdjustmentDetails,
} from "./profitLossLogic";

const toMonthKey = (value: string): string => value.slice(0, 7);

// Stores actual, adjustment and reason so later changes to adjustments/source do not alter closed values.
export const monthLinesToClosingRows = (
  lines: PLMonthLines,
): ClosingLineInput[] => {
  const empty = {
    matter_id: null,
    matter_user_id: null,
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
      matter_user_id: line.matterUserId,
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
      matter_user_id: line.matterUserId,
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

// Order-independent; used to re-verify right after closing.
export const sameClosingRows = (
  a: ClosingLineInput[],
  b: ClosingLineInput[],
): boolean => {
  const normalize = (rows: ClosingLineInput[]) =>
    rows
      .map((row) => JSON.stringify(row))
      .sort()
      .join("\n");
  return a.length === b.length && normalize(a) === normalize(b);
};

// Amount columns are nullable; per-type required columns are enforced NOT NULL by CHECK constraints.
const amount = (value: number | null): number => Number(value ?? 0);

const snapshotAdjustable = (row: ClosingLineInput) => ({
  sourceAmount: amount(row.source_amount),
  adjustmentAmount: amount(row.adjustment_amount),
  actualAmount: amount(row.actual_amount),
  // Closed values do not follow source changes, so no source-changed warning
  // (post-closing changes are detected as diffs, see profitLossDiff.ts).
  sourceChanged: false,
  adjustment: null,
  adjustmentReason: row.adjustment_reason,
});

const bySourceId = (a: { source_id: number }, b: { source_id: number }) =>
  a.source_id - b.source_id;

// Reuses aggregateMonthLines so closed months have the same shape as live months.
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
        matterUserId: row.matter_user_id ?? 0,
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
        matterUserId: row.matter_user_id ?? 0,
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

// Names do not affect amounts, so closed months always show the latest names. If the source row is
// gone (deleted / moved to another month), the stored name is kept. Category/team/amount stay closed values.
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
  // Matter names can also come from sibling lines, so index by matter too.
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

// ===== Closed-month checks and edit locks =====

export const toClosedMonthSet = (
  closings: Pick<ProfitLossClosingType, "target_month">[],
): Set<string> =>
  new Set(closings.map((closing) => toMonthKey(closing.target_month)));

// NULL (no date) is false.
export const isClosedMonth = (
  closedMonths: ReadonlySet<string>,
  dateOrMonth: string | null | undefined,
): boolean => !!dateOrMonth && closedMonths.has(toMonthKey(dateOrMonth));

// Edit lock while closed: not savable if either the old date (undefined for new) or the new date
// is in a closed month (including moves into/out of one). Deletion passes no new date.
export const canWriteExtraEntry = (
  closedMonths: ReadonlySet<string>,
  originalDate: string | null | undefined,
  nextDate: string | null | undefined,
): boolean =>
  !isClosedMonth(closedMonths, originalDate) &&
  !isClosedMonth(closedMonths, nextDate);

// Returns rows that hit the edit lock. New rows check the new date, deleted rows the old date,
// updated rows both. `entries` are only changed rows (selectChangedExtraEntries); `originals` map id -> DB row.
export const findExtraEntryLockViolations = (
  entries: ExtraEntryInListType[],
  originals: ReadonlyMap<number, ExtraEntryType>,
  closedMonths: ReadonlySet<string>,
): string[] =>
  entries
    .filter((entry) => {
      if (entry.isNew && entry.isRemoved) return false;
      if (entry.isNew) {
        return !canWriteExtraEntry(closedMonths, undefined, entry.entry_date);
      }
      const original = originals.get(entry.id);
      if (entry.isRemoved) {
        return isClosedMonth(closedMonths, original?.entry_date);
      }
      return !canWriteExtraEntry(
        closedMonths,
        original?.entry_date,
        entry.entry_date,
      );
    })
    .map((entry) => entry.description || "（内容未入力の行）");

// Recurring cost changes do not affect closed months (noted in the edit dialog).
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

// Used for the matter detail modal warning.
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

export const CLOSED_MONTH_LOCK_MESSAGE =
  "確定済みの月です。編集するには損益計算書で『確定済み』をオフにしてください";

export const formatClosedMonths = (months: string[]): string =>
  months.map(formatMonthLabel).join(" / ");

// Normalizes DB rows to the stored shape (minus id / closing_id).
export const stripClosingLineIds = (
  rows: ProfitLossClosingLineType[],
): ClosingLineInput[] =>
  rows.map((row) => {
    const { id: _id, closing_id: _closingId, ...rest } = row;
    return rest;
  });

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
  // Skip records; RLS restricts them to accounting / admin.
  dismissals: ProfitLossClosingDismissalType[];
};

// Marks whether the target row is in the closing lines (i.e. the adjustment is already included
// in closed values). A row that left after closing is included; one already gone at closing is not.
const markIncludedInClosing = (
  orphans: OrphanedAdjustmentType[],
  closingLines: ClosingLineInput[] | undefined,
): OrphanedAdjustmentType[] => {
  if (!closingLines) return orphans;
  const keys = new Set(
    closingLines.map((line) => `${line.source_type}:${line.source_id}`),
  );
  return orphans.map((orphan) => {
    const { adjustment } = orphan;
    const key =
      adjustment.business_id !== null
        ? `business:${adjustment.business_id}`
        : adjustment.cost_id !== null
          ? `cost:${adjustment.cost_id}`
          : `recurring_cost:${adjustment.recurring_cost_id}`;
    return { ...orphan, includedInClosing: keys.has(key) };
  });
};

// Closed months aggregate from closing lines, unclosed from live lines. undated and
// orphanedAdjustments are always computed from live rows ("undated" is outside closing).
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
    labels: input.labels,
  });
  // Computed only for accounting/admin (includeTeamBreakdown) in the monthly single-month view,
  // using the same needsMonthlyAdjustmentDetails as planAdjustmentSupplement (profitLossSource.ts).
  const monthlyDetails = needsMonthlyAdjustmentDetails({
    includeTeamBreakdown: input.includeTeamBreakdown,
    includeMonthlyDetails: input.includeMonthlyDetails,
  });
  const labelIndex = monthlyDetails ? buildLabelIndex(input.labels) : undefined;
  return {
    ...report,
    undated: computeUndated(
      input.businessRows,
      input.costRows,
      input.extraEntries,
      input.isTeamLeader,
    ),
    orphanedAdjustments: labelIndex
      ? markIncludedInClosing(
          computeOrphanedAdjustments(
            input.month,
            liveLines,
            input.adjustments,
            input.businessRows,
            input.costRows,
            input.recurringCosts,
            labelIndex,
          ),
          input.closing?.lines,
        )
      : undefined,
    closing: input.closing ? toClosingInfo(input.closing.header) : null,
    // Only for roles that can act on diffs (includeTeamBreakdown = accounting / admin).
    closingDiffs:
      input.closing && labelIndex
        ? diffClosingLines({
            liveLines,
            closedLines: input.closing.lines,
            dismissals: input.closing.dismissals,
            labelIndex,
          })
        : undefined,
  };
};
