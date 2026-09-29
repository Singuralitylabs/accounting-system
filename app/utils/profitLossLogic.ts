// Pure aggregation logic for the profit and loss statement, kept separate from the
// "use server" Supabase access so it can be unit-tested without side effects.

import {
  AdjustableAmount,
  BusinessLine,
  CostLine,
  DisplayTitle,
  ExtraEntryLine,
  ExtraEntryType,
  ExtraExpenseSection,
  ExtraIncomeSection,
  GrossProfitBreakdown,
  MatterBreakdown,
  MatterTotals,
  ProfitTotals,
  OrphanedAdjustmentType,
  PLMonthLines,
  PLReportType,
  ProfitLossAdjustmentType,
  ProfitLossLabelType,
  RecurringCostItemBreakdown,
  RecurringCostLine,
  RecurringCostType,
  TeamBreakdown,
  TitledBusinessLine,
  TitledCostLine,
  TitledRecurringCostLine,
} from "../types/types";
import { teamLabel } from "./constants";
import { isIncomeExtraEntry } from "./extraEntry";
import { addMonths, toFirstOfMonth } from "./formatter";
import { hasClassAccess } from "./permissions";

// A matter's month is the month of start_date; draft matters are excluded from aggregation.
// category routes matter costs to per-category gross profit.
export type MatterOfRow = {
  id: number;
  user_id: number;
  title: string;
  team: string;
  category: string;
  start_date: string | null;
  is_fixed: boolean | null;
  is_completed: boolean | null;
};

export type BusinessRow = {
  id: number;
  name: string;
  amount: number | null;
  matter_id: number;
  matters: MatterOfRow;
};

export type CostRow = {
  id: number;
  name: string;
  price: number;
  item: string;
  matter_id: number;
  matters: MatterOfRow;
};

// Avoids Date objects so timezone conversion cannot shift the month.
const toMonthKey = (dateStr: string | null): string | null =>
  dateStr ? dateStr.slice(0, 7) : null;

// NULL is_fixed / is_completed count as false. Same definition as the fetch-side matterPeriodFilter.
export const isDraftMatter = (
  matter: Pick<MatterOfRow, "is_fixed" | "is_completed">,
): boolean => matter.is_fixed !== true && matter.is_completed !== true;

export const matterMonthKey = (
  matter: Pick<MatterOfRow, "start_date">,
): string | null => toMonthKey(matter.start_date);

const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export const monthDiff = (fromMonth: string, toMonth: string): number => {
  const fromYear = parseInt(fromMonth.slice(0, 4), 10);
  const fromMonthNumber = parseInt(fromMonth.slice(5, 7), 10);
  const toYear = parseInt(toMonth.slice(0, 4), 10);
  const toMonthNumber = parseInt(toMonth.slice(5, 7), 10);
  return (toYear - fromYear) * 12 + (toMonthNumber - fromMonthNumber);
};

// Charged in full only when inside the applicable period (end_month inclusive) and on a payment
// month (every cycle interval from start_month).
export const isRecurringCostChargedInMonth = (
  recurringCost: RecurringCostType,
  month: string,
): boolean => {
  const start = recurringCost.start_month.slice(0, 7);
  const end = recurringCost.end_month
    ? recurringCost.end_month.slice(0, 7)
    : null;
  if (!(start <= month && (end === null || month <= end))) {
    return false;
  }
  const cycleMonths = CYCLE_MONTHS[recurringCost.payment_cycle] ?? 1;
  return monthDiff(start, month) % cycleMonths === 0;
};

export const reportFlags = (profileClass: string | null | undefined) => ({
  isTeamLeader: profileClass === "teamleader",
  includeTeamBreakdown: hasClassAccess(["accounting", "admin"], profileClass),
});

// Single definition shared by buildMonthReport (display) and planAdjustmentSupplement
// (profitLossSource.ts, fetch): whether to compute/fetch the rows needed to resolve labels for
// orphanedAdjustments / closingDiffs. Change only here; otherwise needless fetches return or
// labels stay unresolved.
export const needsMonthlyAdjustmentDetails = (flags: {
  includeTeamBreakdown: boolean;
  includeMonthlyDetails: boolean;
}): boolean => flags.includeTeamBreakdown && flags.includeMonthlyDetails;

// Inclusive month-key range. The annual trend passes the whole fiscal year to avoid 12 queries.
export type ReportPeriod = {
  startMonth: string;
  endMonth: string;
};

export { isMonthKey } from "./formatter";

// Groups sorted, unique month keys into ranges of consecutive months.
export const groupConsecutiveMonths = (months: string[]): ReportPeriod[] =>
  months.reduce<ReportPeriod[]>((periods, month) => {
    const last = periods[periods.length - 1];
    if (last && addMonths(last.endMonth, 1) === month) {
      last.endMonth = month;
    } else {
      periods.push({ startMonth: month, endMonth: month });
    }
    return periods;
  }, []);

export type ReportRangeBounds = {
  startDate: string;
  endExclusive: string;
};

const firstDayOfNextMonth = (monthKey: string): string =>
  toFirstOfMonth(addMonths(monthKey, 1));

// Single definition of the [startDate, endExclusive) range used by both SQL WHERE and in-memory
// filters. Callers must guarantee startMonth <= endMonth.
export const reportRangeBounds = (period: ReportPeriod): ReportRangeBounds => ({
  startDate: `${period.startMonth}-01`,
  endExclusive: firstDayOfNextMonth(period.endMonth),
});

// Keeps NULL (month-undetermined) rows.
export const isDateInRangeOrUndated = (
  dateStr: string | null,
  bounds: ReportRangeBounds,
): boolean =>
  dateStr === null ||
  (dateStr >= bounds.startDate && dateStr < bounds.endExclusive);

// In-memory version of matterPeriodFilter.
export const isMatterInRangeOrUndated = (
  matter: Pick<MatterOfRow, "start_date" | "is_fixed" | "is_completed">,
  bounds: ReportRangeBounds,
): boolean =>
  !isDraftMatter(matter) && isDateInRangeOrUndated(matter.start_date, bounds);

// Only excludes rows whose period does not overlap; payment-cycle checks happen in buildLiveMonthLines.
export const doesRecurringCostOverlapRange = (
  recurringCost: Pick<RecurringCostType, "start_month" | "end_month">,
  bounds: ReportRangeBounds,
): boolean =>
  recurringCost.start_month < bounds.endExclusive &&
  (recurringCost.end_month === null ||
    recurringCost.end_month >= bounds.startDate);

export const isAdjustmentInRange = (
  targetMonth: string,
  bounds: ReportRangeBounds,
): boolean =>
  targetMonth >= bounds.startDate && targetMonth < bounds.endExclusive;

// Collects adjustment targets missing from the fetched rows (moved outside the period), for
// orphanedAdjustments label resolution. Aggregates are unchanged because month bucketing still
// excludes them.
export const collectMissingAdjustmentTargetIds = (
  month: string,
  adjustments: Pick<
    ProfitLossAdjustmentType,
    "target_month" | "business_id" | "cost_id" | "recurring_cost_id"
  >[],
  businessIds: ReadonlySet<number>,
  costIds: ReadonlySet<number>,
  recurringCostIds: ReadonlySet<number>,
): { businessIds: number[]; costIds: number[]; recurringCostIds: number[] } => {
  const missingBusinessIds = new Set<number>();
  const missingCostIds = new Set<number>();
  const missingRecurringCostIds = new Set<number>();
  adjustments
    .filter((adjustment) => toMonthKey(adjustment.target_month) === month)
    .forEach((adjustment) => {
      if (
        adjustment.business_id !== null &&
        !businessIds.has(adjustment.business_id)
      ) {
        missingBusinessIds.add(adjustment.business_id);
      }
      if (adjustment.cost_id !== null && !costIds.has(adjustment.cost_id)) {
        missingCostIds.add(adjustment.cost_id);
      }
      if (
        adjustment.recurring_cost_id !== null &&
        !recurringCostIds.has(adjustment.recurring_cost_id)
      ) {
        missingRecurringCostIds.add(adjustment.recurring_cost_id);
      }
    });
  return {
    businessIds: Array.from(missingBusinessIds),
    costIds: Array.from(missingCostIds),
    recurringCostIds: Array.from(missingRecurringCostIds),
  };
};

// or() filter "in period OR NULL" for extra_entries.entry_date, shared by SQL and tests.
// `column` is a union type to keep arbitrary strings out.
export const datedOrUndatedFilter = (
  column: "entry_date" | "start_date",
  bounds: ReportRangeBounds,
): string =>
  `and(${column}.gte.${bounds.startDate},${column}.lt.${bounds.endExclusive}),${column}.is.null`;

// or() for the embedded matters (!inner): (not draft AND in period) OR (not draft AND NULL).
// supabase-js emits one or= per referencedTable, so both conditions are merged into one expression.
// is.true keeps NULL on the draft side, like isDraftMatter.
export const matterPeriodFilter = (bounds: ReportRangeBounds): string => {
  const notDraft = "or(is_fixed.is.true,is_completed.is.true)";
  return `and(${notDraft},start_date.gte.${bounds.startDate},start_date.lt.${bounds.endExclusive}),and(${notDraft},start_date.is.null)`;
};

// Used with `start_month < endExclusive` via AND.
export const recurringOverlapEndFilter = (bounds: ReportRangeBounds): string =>
  `end_month.gte.${bounds.startDate},end_month.is.null`;

// Input of buildMonthReport (profitLossClosing.ts); an object avoids mixing up the boolean flags.
export type MonthlyReportInput = {
  month: string; // "YYYY-MM"
  businessRows: BusinessRow[];
  costRows: CostRow[];
  recurringCosts: RecurringCostType[];
  extraEntries: ExtraEntryType[];
  adjustments: ProfitLossAdjustmentType[];
  isTeamLeader: boolean;
  includeTeamBreakdown: boolean;
  // Details only shown in the monthly tab's single-month view. The annual trend passes false to
  // skip 12 months of wasted computation.
  includeMonthlyDetails: boolean;
  labels?: ProfitLossLabelType[];
};

// ===== Display titles =====

export type LabelIndex = {
  matter: Map<number, string>;
  business: Map<number, string>;
  cost: Map<number, string>;
  recurringCost: Map<number, string>;
};

export const buildLabelIndex = (
  labels: Pick<
    ProfitLossLabelType,
    "matter_id" | "business_id" | "cost_id" | "recurring_cost_id" | "label"
  >[] = [],
): LabelIndex => {
  const index: LabelIndex = {
    matter: new Map(),
    business: new Map(),
    cost: new Map(),
    recurringCost: new Map(),
  };
  labels.forEach((label) => {
    if (label.matter_id !== null) {
      index.matter.set(label.matter_id, label.label);
    } else if (label.business_id !== null) {
      index.business.set(label.business_id, label.label);
    } else if (label.cost_id !== null) {
      index.cost.set(label.cost_id, label.label);
    } else if (label.recurring_cost_id !== null) {
      index.recurringCost.set(label.recurring_cost_id, label.label);
    }
  });
  return index;
};

export const resolveTitle = (
  originalTitle: string,
  customTitle: string | undefined,
): DisplayTitle => ({
  displayTitle: customTitle ?? originalTitle,
  isCustomTitle: customTitle !== undefined,
});

// Trims; empty becomes null (removes the override). Matches the DB function save_profit_loss_label.
export const normalizeLabelInput = (input: string): string | null => {
  const trimmed = input.trim();
  return trimmed === "" ? null : trimmed;
};

// Matches the DB CHECK char_length(label) <= 200.
export const LABEL_MAX_LENGTH = 200;

type AdjustmentKey = "business_id" | "cost_id" | "recurring_cost_id";

// Builds a Map once per call for O(1) lookup instead of scanning adjustments per line.
const buildAdjustmentIndex = (
  adjustments: ProfitLossAdjustmentType[],
  month: string,
): Map<string, ProfitLossAdjustmentType> => {
  const index = new Map<string, ProfitLossAdjustmentType>();
  adjustments.forEach((adjustment) => {
    if (toMonthKey(adjustment.target_month) !== month) return;
    const key: AdjustmentKey =
      adjustment.business_id !== null
        ? "business_id"
        : adjustment.cost_id !== null
          ? "cost_id"
          : "recurring_cost_id";
    index.set(`${key}:${adjustment[key]}`, adjustment);
  });
  return index;
};

const findAdjustment = (
  index: Map<string, ProfitLossAdjustmentType>,
  key: AdjustmentKey,
  id: number,
): ProfitLossAdjustmentType | undefined => index.get(`${key}:${id}`);

// Actual is always current source + adjustment delta. The delta is not auto-updated when the
// source changes later; sourceChanged only warns.
const toAdjustable = (
  sourceAmount: number,
  adjustment: ProfitLossAdjustmentType | undefined,
): AdjustableAmount => {
  const adjustmentAmount = adjustment?.adjustment_amount ?? 0;
  return {
    sourceAmount,
    adjustmentAmount,
    actualAmount: sourceAmount + adjustmentAmount,
    sourceChanged: adjustment
      ? adjustment.source_amount_snapshot !== sourceAmount
      : false,
    adjustment: adjustment ?? null,
    adjustmentReason: adjustment?.reason ?? null,
  };
};

const byNumber =
  <T>(key: (value: T) => number) =>
  (a: T, b: T) =>
    key(a) - key(b);

export const toExtraEntryLine = (entry: ExtraEntryType): ExtraEntryLine => ({
  extraEntryId: entry.id,
  entryType: entry.entry_type,
  category: entry.category,
  description: entry.description,
  team: entry.team,
  entryDate: entry.entry_date,
  billingAmount: entry.billing_amount,
  expenseAmount: entry.expense_amount,
});

// Single place for the inclusion rules of one extra entry (used by splitExtraEntries, team
// breakdown and undated totals).
// Income entry: billed amount -> sales, expense (optional) -> matter cost (both in gross profit).
// Expense entry: expense -> admin cost (excluded from gross profit).
export const classifyExtraEntry = (
  entry: ExtraEntryLine,
): { isIncome: boolean; revenue: number; cost: number; adminCost: number } =>
  isIncomeExtraEntry(entry)
    ? {
        isIncome: true,
        revenue: entry.billingAmount ?? 0,
        cost: entry.expenseAmount ?? 0,
        adminCost: 0,
      }
    : {
        isIncome: false,
        revenue: 0,
        cost: 0,
        adminCost: entry.expenseAmount ?? 0,
      };

const toTotals = (revenue: number, cost: number): ProfitTotals => ({
  revenue,
  cost,
  grossProfit: revenue - cost,
});

// Amounts come from classifyExtraEntry; the UI must not re-split.
export const splitExtraEntries = (
  entries: readonly ExtraEntryLine[],
): { extraIncome: ExtraIncomeSection; extraExpense: ExtraExpenseSection } => {
  let revenue = 0;
  let cost = 0;
  let expenseTotal = 0;
  const incomeEntries: ExtraIncomeSection["entries"] = [];
  const expenseEntries: ExtraExpenseSection["entries"] = [];
  entries.forEach((entry) => {
    const amounts = classifyExtraEntry(entry);
    if (amounts.isIncome) {
      revenue += amounts.revenue;
      cost += amounts.cost;
      incomeEntries.push({
        ...entry,
        grossProfit: amounts.revenue - amounts.cost,
      });
    } else {
      expenseTotal += amounts.adminCost;
      expenseEntries.push(entry);
    }
  });
  return {
    extraIncome: { ...toTotals(revenue, cost), entries: incomeEntries },
    extraExpense: { total: expenseTotal, entries: expenseEntries },
  };
};

// No role-based include/reference split here (done in aggregateMonthLines). Closing snapshots
// store this result as-is.
export const buildLiveMonthLines = ({
  month,
  businessRows,
  costRows,
  recurringCosts,
  extraEntries,
  adjustments,
}: Pick<
  MonthlyReportInput,
  | "month"
  | "businessRows"
  | "costRows"
  | "recurringCosts"
  | "extraEntries"
  | "adjustments"
>): PLMonthLines => {
  const adjustmentIndex = buildAdjustmentIndex(adjustments, month);

  // Draft matters are excluded. Fetch filters the same way, but supplement rows for
  // orphanedAdjustments labels may be out of period or draft, so check again here.
  const isCountedInMonth = (matter: MatterOfRow) =>
    !isDraftMatter(matter) && matterMonthKey(matter) === month;

  const businesses: BusinessLine[] = businessRows
    .filter((row) => isCountedInMonth(row.matters))
    .map((row) => ({
      ...toAdjustable(
        row.amount ?? 0,
        findAdjustment(adjustmentIndex, "business_id", row.id),
      ),
      businessId: row.id,
      name: row.name,
      matterId: row.matter_id,
      matterUserId: row.matters.user_id,
      matterTitle: row.matters.title,
      category: row.matters.category,
      team: row.matters.team,
    }))
    .sort(byNumber((line) => line.businessId));

  const costs: CostLine[] = costRows
    .filter((row) => isCountedInMonth(row.matters))
    .map((row) => ({
      ...toAdjustable(
        row.price,
        findAdjustment(adjustmentIndex, "cost_id", row.id),
      ),
      costId: row.id,
      name: row.name,
      item: row.item,
      matterId: row.matter_id,
      matterUserId: row.matters.user_id,
      matterTitle: row.matters.title,
      category: row.matters.category,
      team: row.matters.team,
    }))
    .sort(byNumber((line) => line.costId));

  const recurringCostLines: RecurringCostLine[] = recurringCosts
    .filter((rc) => isRecurringCostChargedInMonth(rc, month))
    .map((rc) => ({
      ...toAdjustable(
        rc.price,
        findAdjustment(adjustmentIndex, "recurring_cost_id", rc.id),
      ),
      recurringCostId: rc.id,
      name: rc.name,
      item: rc.item,
      team: rc.team,
      paymentCycle: rc.payment_cycle,
    }))
    .sort(byNumber((line) => line.recurringCostId));

  // NULL entry_date is aggregated separately as month-undetermined.
  const extraEntryLines = extraEntries
    .filter((entry) => toMonthKey(entry.entry_date) === month)
    .map(toExtraEntryLine)
    .sort(byNumber((line) => line.extraEntryId));

  return {
    businesses,
    costs,
    recurringCosts: recurringCostLines,
    extraEntries: extraEntryLines,
  };
};

const titledBusinessLine = (
  line: BusinessLine,
  labelIndex: LabelIndex,
): TitledBusinessLine => ({
  ...line,
  ...resolveTitle(line.name, labelIndex.business.get(line.businessId)),
});
const titledCostLine = (
  line: CostLine,
  labelIndex: LabelIndex,
): TitledCostLine => ({
  ...line,
  ...resolveTitle(line.name, labelIndex.cost.get(line.costId)),
});
const titledRecurringCostLine = (
  line: RecurringCostLine,
  labelIndex: LabelIndex,
): TitledRecurringCostLine => ({
  ...line,
  ...resolveTitle(
    line.name,
    labelIndex.recurringCost.get(line.recurringCostId),
  ),
});

// Matters are sorted by ID; breakdowns are sales lines then cost lines (each by ID), sorted first so
// output is stable regardless of fetch order (live/closed). Matter name = first line's. Extra
// entries are not matters and are excluded. categories/teams list per-line values because
// category/team aggregation is per line.
export const buildMatterBreakdowns = (
  businesses: BusinessLine[],
  costs: CostLine[],
  labelIndex: LabelIndex = buildLabelIndex(),
): MatterBreakdown[] => {
  const matters = new Map<number, MatterBreakdown>();
  const getMatter = (line: BusinessLine | CostLine) => {
    if (!matters.has(line.matterId)) {
      matters.set(line.matterId, {
        ...resolveTitle(line.matterTitle, labelIndex.matter.get(line.matterId)),
        matterId: line.matterId,
        matterTitle: line.matterTitle,
        categories: [],
        teams: [],
        revenue: 0,
        cost: 0,
        grossProfit: 0,
        businesses: [],
        costs: [],
      });
    }
    const matter = matters.get(line.matterId)!;
    if (!matter.categories.includes(line.category)) {
      matter.categories.push(line.category);
    }
    if (!matter.teams.includes(line.team)) {
      matter.teams.push(line.team);
    }
    return matter;
  };

  [...businesses].sort(byNumber((line) => line.businessId)).forEach((line) => {
    const matter = getMatter(line);
    matter.revenue += line.actualAmount;
    matter.businesses.push(titledBusinessLine(line, labelIndex));
  });
  [...costs].sort(byNumber((line) => line.costId)).forEach((line) => {
    const matter = getMatter(line);
    matter.cost += line.actualAmount;
    matter.costs.push(titledCostLine(line, labelIndex));
  });

  return Array.from(matters.values())
    .map((matter) => ({
      ...matter,
      grossProfit: matter.revenue - matter.cost,
    }))
    .sort(byNumber((matter) => matter.matterId));
};

export const sumMatterBreakdowns = (
  matters: readonly MatterBreakdown[],
): MatterTotals => {
  const revenue = matters.reduce((sum, matter) => sum + matter.revenue, 0);
  const cost = matters.reduce((sum, matter) => sum + matter.cost, 0);
  return toTotals(revenue, cost);
};

// Per-category gross profit. Each line belongs to exactly one category, so totals always equal
// sumMatterBreakdowns. Extra entries are excluded so expense categories do not mix with sales
// categories. Independent of specific category names (they follow select_options).
export const buildCategoryBreakdown = (
  businesses: BusinessLine[],
  costs: CostLine[],
): GrossProfitBreakdown[] => {
  const map = new Map<string, { revenue: number; cost: number }>();
  const add = (category: string, revenue: number, cost: number) => {
    const entry = map.get(category) ?? { revenue: 0, cost: 0 };
    entry.revenue += revenue;
    entry.cost += cost;
    map.set(category, entry);
  };
  businesses.forEach((line) => add(line.category, line.actualAmount, 0));
  costs.forEach((line) => add(line.category, 0, line.actualAmount));
  return Array.from(map.entries())
    .map(([category, { revenue, cost }]) => ({
      category,
      revenue,
      cost,
      grossProfit: revenue - cost,
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit);
};

export type AggregateInput = {
  month: string; // "YYYY-MM"
  lines: PLMonthLines;
  isTeamLeader: boolean;
  includeTeamBreakdown: boolean;
  labels?: ProfitLossLabelType[];
};

// Undated and orphanedAdjustments are computed separately from fetched rows, so return empty here.
export const aggregateMonthLines = ({
  month,
  lines,
  isTeamLeader,
  includeTeamBreakdown,
  labels = [],
}: AggregateInput): PLReportType => {
  const labelIndex = buildLabelIndex(labels);
  // teamleader: team IS NULL extra entries / admin costs are reference-only, not counted
  // (matters.team is NOT NULL, so matters always count).
  const countedExtraEntries = isTeamLeader
    ? lines.extraEntries.filter((entry) => entry.team !== null)
    : lines.extraEntries;
  const orgWideExtraEntries = isTeamLeader
    ? lines.extraEntries.filter((entry) => entry.team === null)
    : undefined;
  const titledRecurringCosts = lines.recurringCosts.map((line) =>
    titledRecurringCostLine(line, labelIndex),
  );
  const countedRecurringCosts = isTeamLeader
    ? titledRecurringCosts.filter((line) => line.team !== null)
    : titledRecurringCosts;
  const orgWideRecurringCosts = isTeamLeader
    ? titledRecurringCosts.filter((line) => line.team === null)
    : undefined;

  // ===== Gross profit = matters (per category) + extra entries (income) =====
  const matterBreakdowns = buildMatterBreakdowns(
    lines.businesses,
    lines.costs,
    labelIndex,
  );
  const categoryBreakdown = buildCategoryBreakdown(
    lines.businesses,
    lines.costs,
  );
  const matterTotals = sumMatterBreakdowns(matterBreakdowns);
  const { extraIncome, extraExpense } = splitExtraEntries(countedExtraEntries);
  const revenueTotal = matterTotals.revenue + extraIncome.revenue;
  const matterCostTotal = matterTotals.cost + extraIncome.cost;
  const grossProfitTotal = revenueTotal - matterCostTotal;

  // ===== Admin costs (recurring costs by item) =====
  const recurringItemMap = new Map<string, TitledRecurringCostLine[]>();
  countedRecurringCosts.forEach((line) => {
    if (!recurringItemMap.has(line.item)) {
      recurringItemMap.set(line.item, []);
    }
    recurringItemMap.get(line.item)!.push(line);
  });
  const recurringCostByItem: RecurringCostItemBreakdown[] = Array.from(
    recurringItemMap.entries(),
  )
    .map(([item, details]) => ({
      item,
      amount: details.reduce((sum, detail) => sum + detail.actualAmount, 0),
      details,
    }))
    .sort((a, b) => b.amount - a.amount);
  const recurringCostTotal = recurringCostByItem.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  // Extra entry (expense) costs count as admin costs.
  const adminCostTotal = recurringCostTotal + extraExpense.total;

  // ===== Team breakdown (accounting / admin only) =====
  let byTeam: TeamBreakdown[] | undefined;
  if (includeTeamBreakdown) {
    const teamMap = new Map<string, TeamBreakdown>();
    const getTeamEntry = (team: string | null): TeamBreakdown => {
      const label = teamLabel(team);
      if (!teamMap.has(label)) {
        teamMap.set(label, {
          team: label,
          revenue: 0,
          matterCost: 0,
          grossProfit: 0,
          adminCost: 0,
          profit: 0,
        });
      }
      return teamMap.get(label)!;
    };
    // Same lines/actuals as the totals so the table and team breakdown match. Team is per line
    // (a closed month may reflect only some lines), so not aggregated per matter.
    lines.businesses.forEach((line) => {
      getTeamEntry(line.team).revenue += line.actualAmount;
    });
    lines.costs.forEach((line) => {
      getTeamEntry(line.team).matterCost += line.actualAmount;
    });
    countedExtraEntries.forEach((extra) => {
      const entry = getTeamEntry(extra.team);
      const amounts = classifyExtraEntry(extra);
      entry.revenue += amounts.revenue;
      entry.matterCost += amounts.cost;
      entry.adminCost += amounts.adminCost;
    });
    lines.recurringCosts.forEach((line) => {
      getTeamEntry(line.team).adminCost += line.actualAmount;
    });
    byTeam = Array.from(teamMap.values())
      .map((entry) => ({
        ...entry,
        grossProfit: entry.revenue - entry.matterCost,
        profit: entry.revenue - entry.matterCost - entry.adminCost,
      }))
      .sort((a, b) => b.profit - a.profit);
  }

  return {
    month,
    revenueTotal,
    matterCostTotal,
    grossProfitTotal,
    matterBreakdowns,
    matterTotals,
    categoryBreakdown,
    extraIncome,
    recurringCostTotal,
    recurringCostByItem,
    extraExpense,
    adminCostTotal,
    orgWideRecurringCosts,
    orgWideExtraEntries,
    ordinaryProfit: grossProfitTotal - adminCostTotal,
    byTeam,
    undated: { revenue: 0, matterCost: 0, adminCost: 0 },
    orphanedAdjustments: undefined,
    // Live (unclosed). Closed months are overwritten by buildMonthReport (profitLossClosing.ts).
    closing: null,
  };
};

// Month-undetermined sales/costs, excluding drafts. Extra-entry expense counts as admin cost.
// teamleader excludes team IS NULL extra entries like aggregateMonthLines (RLS still returns them).
// Always live values, even for closed months.
export const computeUndated = (
  businessRows: BusinessRow[],
  costRows: CostRow[],
  extraEntries: ExtraEntryType[],
  isTeamLeader: boolean,
): PLReportType["undated"] => {
  const isUndatedMatter = (matter: MatterOfRow) =>
    !isDraftMatter(matter) && matter.start_date === null;
  const { extraIncome, extraExpense } = splitExtraEntries(
    extraEntries
      .filter((entry) => entry.entry_date === null)
      .filter((entry) => !isTeamLeader || entry.team !== null)
      .map(toExtraEntryLine),
  );
  return {
    revenue:
      businessRows
        .filter((row) => isUndatedMatter(row.matters))
        .reduce((sum, row) => sum + (row.amount ?? 0), 0) + extraIncome.revenue,
    matterCost:
      costRows
        .filter((row) => isUndatedMatter(row.matters))
        .reduce((sum, row) => sum + row.price, 0) + extraIncome.cost,
    adminCost: extraExpense.total,
  };
};

// Adjustments whose target row exists but left this month's aggregation (start date changed,
// matter back to draft). Adjustments whose target was deleted (CASCADE) no longer exist.
// `lines` are the live month lines (buildLiveMonthLines).
export const computeOrphanedAdjustments = (
  month: string,
  lines: PLMonthLines,
  adjustments: ProfitLossAdjustmentType[],
  businessRows: BusinessRow[],
  costRows: CostRow[],
  recurringCosts: RecurringCostType[],
  labelIndex: LabelIndex = buildLabelIndex(),
): OrphanedAdjustmentType[] => {
  const monthlyBusinessIds = new Set(
    lines.businesses.map((line) => line.businessId),
  );
  const monthlyCostIds = new Set(lines.costs.map((line) => line.costId));
  const activeRecurringCostIds = new Set(
    lines.recurringCosts.map((line) => line.recurringCostId),
  );

  // Search all rows (before month filtering) to identify the target.
  const businessById = new Map(businessRows.map((row) => [row.id, row]));
  const costById = new Map(costRows.map((row) => [row.id, row]));
  const recurringCostById = new Map(recurringCosts.map((rc) => [rc.id, rc]));
  const matterTitleOf = (row: BusinessRow | CostRow) =>
    labelIndex.matter.get(row.matter_id) ?? row.matters.title;

  return adjustments
    .filter((adjustment) => toMonthKey(adjustment.target_month) === month)
    .filter((adjustment) => {
      if (adjustment.business_id !== null) {
        return !monthlyBusinessIds.has(adjustment.business_id);
      }
      if (adjustment.cost_id !== null) {
        return !monthlyCostIds.has(adjustment.cost_id);
      }
      return !activeRecurringCostIds.has(adjustment.recurring_cost_id!);
    })
    .map((adjustment) => {
      if (adjustment.business_id !== null) {
        const row = businessById.get(adjustment.business_id);
        return {
          adjustment,
          targetType: "business" as const,
          label: row
            ? `${matterTitleOf(row)} - ${labelIndex.business.get(row.id) ?? row.name}`
            : `売上（ID: ${adjustment.business_id}）`,
        };
      }
      if (adjustment.cost_id !== null) {
        const row = costById.get(adjustment.cost_id);
        return {
          adjustment,
          targetType: "cost" as const,
          label: row
            ? `${matterTitleOf(row)} - ${labelIndex.cost.get(row.id) ?? row.name}（${row.item}）`
            : `案件費用（ID: ${adjustment.cost_id}）`,
        };
      }
      const rc = recurringCostById.get(adjustment.recurring_cost_id!);
      return {
        adjustment,
        targetType: "recurring_cost" as const,
        label: rc
          ? (labelIndex.recurringCost.get(rc.id) ?? rc.name)
          : `管理費（ID: ${adjustment.recurring_cost_id}）`,
      };
    });
};

// Fiscal year (July - June) month keys.
export const fiscalYearMonths = (fiscalYear: number): string[] =>
  Array.from({ length: 12 }, (_, i) => {
    const monthNumber = ((6 + i) % 12) + 1;
    const year = monthNumber >= 7 ? fiscalYear : fiscalYear + 1;
    return `${year}-${String(monthNumber).padStart(2, "0")}`;
  });
