// Server-only fetching of P&L source rows, shared by profitLossReport.ts and profitLossClosings.ts so
// both read the same rows under the same conditions. No "use server" so these are not exposed as
// Server Actions (same as requestCache.ts / viewerAccess.ts).

import type { PostgrestError } from "@supabase/supabase-js";
import {
  ClosingDiff,
  DiffSourceType,
  ProfitLossAdjustmentType,
  ProfitLossLabelType,
  RecurringCostType,
  ExtraEntryType,
} from "../../types/types";
import {
  BusinessRow,
  CostRow,
  ReportPeriod,
  collectMissingAdjustmentTargetIds,
  datedOrUndatedFilter,
  isDraftMatter,
  matterMonthKey,
  matterPeriodFilter,
  needsMonthlyAdjustmentDetails,
  recurringOverlapEndFilter,
  reportRangeBounds,
} from "../profitLossLogic";
import {
  MonthClosingSnapshot,
  stripClosingLineIds,
} from "../profitLossClosing";
import { annotateDiffMoves, diffKeyOf } from "../profitLossDiff";
import { toFirstOfMonth } from "../formatter";
import { createServerSupabase } from "./clients";
import { fetchClosedMonthKeys } from "./closedMonthsQuery";
import { fetchAllByIds, fetchAllPages } from "./paging";

// Columns for business / costs. Joins matters (start date, draft check, labels); shared by the normal
// and orphanedAdjustments supplement fetches. matters is !inner so the embedded filter
// (matterPeriodFilter) narrows the parent rows.
const MATTER_COLUMNS =
  "matters!inner(id, user_id, title, team, category, start_date, is_fixed, is_completed)";
export const BUSINESS_SELECT = `id, name, amount, matter_id, ${MATTER_COLUMNS}`;
export const COST_SELECT = `id, name, price, item, matter_id, ${MATTER_COLUMNS}`;

export type LiveSourceRows = {
  businessRows: BusinessRow[];
  costRows: CostRow[];
  recurringCosts: RecurringCostType[];
  extraEntries: ExtraEntryType[];
  adjustments: ProfitLossAdjustmentType[];
};

export type ReportSourceRows = LiveSourceRows & {
  labels: ProfitLossLabelType[];
  // Closed month ("YYYY-MM") -> snapshot.
  closings: Map<string, MonthClosingSnapshot>;
};

// Only the rows needed for live aggregation (RLS-filtered): closing needs nothing else, and
// fetchReportSourceRows calls this in parallel with other fetches.
export const fetchLiveSourceRows = async (
  period: ReportPeriod,
): Promise<LiveSourceRows | null> => {
  const supabase = createServerSupabase();
  const bounds = reportRangeBounds(period);

  // Filter on the embedded matters!inner. Page by id with fetchAllPages, since annual trend and
  // post-closing summaries fetch several months and can exceed max_rows.
  const businessQuery = fetchAllPages((afterId, limit) =>
    supabase
      .from("business")
      .select(BUSINESS_SELECT)
      .or(matterPeriodFilter(bounds), { referencedTable: "matters" })
      .gt("id", afterId)
      .order("id", { ascending: true })
      .limit(limit),
  );
  const costQuery = fetchAllPages((afterId, limit) =>
    supabase
      .from("costs")
      .select(COST_SELECT)
      .or(matterPeriodFilter(bounds), { referencedTable: "matters" })
      .gt("id", afterId)
      .order("id", { ascending: true })
      .limit(limit),
  );
  // Filter by overlap of the applicable period; payment-cycle checks happen in aggregation.
  const recurringQuery = fetchAllPages((afterId, limit) =>
    supabase
      .from("recurring_costs")
      .select("*")
      .lt("start_month", bounds.endExclusive)
      .or(recurringOverlapEndFilter(bounds))
      .gt("id", afterId)
      .order("id", { ascending: true })
      .limit(limit),
  );
  const extraQuery = fetchAllPages((afterId, limit) =>
    supabase
      .from("extra_entries")
      .select("*")
      .or(datedOrUndatedFilter("entry_date", bounds))
      .gt("id", afterId)
      .order("id", { ascending: true })
      .limit(limit),
  );
  const adjustmentQuery = fetchAllPages((afterId, limit) =>
    supabase
      .from("profit_loss_adjustments")
      .select("*")
      .gte("target_month", bounds.startDate)
      .lt("target_month", bounds.endExclusive)
      .gt("id", afterId)
      .order("id", { ascending: true })
      .limit(limit),
  );

  const [
    businessResult,
    costResult,
    recurringResult,
    extraResult,
    adjustmentResult,
  ] = await Promise.all([
    businessQuery,
    costQuery,
    recurringQuery,
    extraQuery,
    adjustmentQuery,
  ]);
  const error =
    businessResult.error ??
    costResult.error ??
    recurringResult.error ??
    extraResult.error ??
    adjustmentResult.error;
  if (error) {
    console.error("損益レポートのデータ取得に失敗しました:", error);
    return null;
  }
  return {
    businessRows: (businessResult.data ?? []) as BusinessRow[],
    costRows: (costResult.data ?? []) as CostRow[],
    recurringCosts: recurringResult.data ?? [],
    extraEntries: extraResult.data ?? [],
    adjustments: adjustmentResult.data ?? [],
  };
};

// Closing snapshots: closed month -> header, closing lines, skip records. PostgREST max_rows also
// applies to embedded arrays, so lines/skips are paged in separate queries (filtered by the
// header month range via !inner) instead of embedded. RLS returns lines for a teamleader only for
// own team + team-less (+ own matters), and skip records for accounting / admin only.
const fetchClosingSnapshots = async (
  period: ReportPeriod,
): Promise<Map<string, MonthClosingSnapshot> | null> => {
  const supabase = createServerSupabase();
  const bounds = reportRangeBounds(period);
  const [closingResult, closingLineResult, dismissalResult] = await Promise.all([
    supabase
      .from("profit_loss_closings")
      .select("*")
      .gte("target_month", bounds.startDate)
      .lt("target_month", bounds.endExclusive),
    fetchAllPages((afterId, limit) =>
      supabase
        .from("profit_loss_closing_lines")
        .select("*, profit_loss_closings!inner(target_month)")
        .gte("profit_loss_closings.target_month", bounds.startDate)
        .lt("profit_loss_closings.target_month", bounds.endExclusive)
        .gt("id", afterId)
        .order("id", { ascending: true })
        .limit(limit),
    ),
    fetchAllPages((afterId, limit) =>
      supabase
        .from("profit_loss_closing_dismissals")
        .select("*, profit_loss_closings!inner(target_month)")
        .gte("profit_loss_closings.target_month", bounds.startDate)
        .lt("profit_loss_closings.target_month", bounds.endExclusive)
        .gt("id", afterId)
        .order("id", { ascending: true })
        .limit(limit),
    ),
  ]);
  const error =
    closingResult.error ?? closingLineResult.error ?? dismissalResult.error;
  if (error) {
    console.error("損益レポートの確定スナップショットの取得に失敗しました:", error);
    return null;
  }

  // Group by closing header (embedded target_month is not used).
  const stripJoin = <T extends { profit_loss_closings: unknown }>({
    profit_loss_closings: _closing,
    ...row
  }: T) => row;
  const closings = new Map<string, MonthClosingSnapshot>();
  (closingResult.data ?? []).forEach((header) => {
    closings.set(header.target_month.slice(0, 7), {
      header,
      lines: stripClosingLineIds(
        (closingLineResult.data ?? [])
          .filter((line) => line.closing_id === header.id)
          .map(stripJoin),
      ),
      dismissals: (dismissalResult.data ?? [])
        .filter((dismissal) => dismissal.closing_id === header.id)
        .map(stripJoin),
    });
  });
  return closings;
};

export type ClosingSourceRows = LiveSourceRows & {
  closings: Map<string, MonthClosingSnapshot>;
};

// Live rows plus snapshots only (post-closing diff counts / apply / skip); no titles or team master.
export const fetchClosingSourceRows = async (
  period: ReportPeriod,
): Promise<ClosingSourceRows | null> => {
  const [liveRows, closings] = await Promise.all([
    fetchLiveSourceRows(period),
    fetchClosingSnapshots(period),
  ]);
  return liveRows && closings ? { ...liveRows, closings } : null;
};

export type LabelTargetIds = {
  matterIds: number[];
  businessIds: number[];
  costIds: number[];
  recurringCostIds: number[];
};

// Collects IDs that display titles may be looked up for: live lines, closing lines (including
// rows deleted or moved to another month), the diff list and orphanedAdjustments:
// - matters: matter IDs of live sales/costs and closing lines
// - sales / costs / recurring costs: live row IDs, closing source_id, adjustment target IDs
// (targets moved outside the period are supplemented in fetchReportSourceRows).
export const collectLabelTargetIds = (
  rows: Pick<
    ClosingSourceRows,
    "businessRows" | "costRows" | "recurringCosts" | "adjustments" | "closings"
  >,
): LabelTargetIds => {
  const matterIds = new Set<number>();
  const businessIds = new Set<number>();
  const costIds = new Set<number>();
  const recurringCostIds = new Set<number>();
  rows.businessRows.forEach((row) => {
    businessIds.add(row.id);
    matterIds.add(row.matter_id);
  });
  rows.costRows.forEach((row) => {
    costIds.add(row.id);
    matterIds.add(row.matter_id);
  });
  rows.recurringCosts.forEach((rc) => recurringCostIds.add(rc.id));
  rows.adjustments.forEach((adjustment) => {
    if (adjustment.business_id !== null) businessIds.add(adjustment.business_id);
    if (adjustment.cost_id !== null) costIds.add(adjustment.cost_id);
    if (adjustment.recurring_cost_id !== null) {
      recurringCostIds.add(adjustment.recurring_cost_id);
    }
  });
  rows.closings.forEach(({ lines }) =>
    lines.forEach((line) => {
      if (line.source_type === "business") businessIds.add(line.source_id);
      if (line.source_type === "cost") costIds.add(line.source_id);
      if (line.source_type === "recurring_cost") {
        recurringCostIds.add(line.source_id);
      }
      if (
        (line.source_type === "business" || line.source_type === "cost") &&
        line.matter_id !== null
      ) {
        matterIds.add(line.matter_id);
      }
    }),
  );
  return {
    matterIds: Array.from(matterIds),
    businessIds: Array.from(businessIds),
    costIds: Array.from(costIds),
    recurringCostIds: Array.from(recurringCostIds),
  };
};

// Fetch only titles for the displayed rows' IDs (not all, which grows with operating period). fetchAllByIds
// chunks/pages to avoid URL length and max_rows; types are queried in parallel, and types with no IDs are skipped.
const fetchLabelsByTargetIds = async (
  ids: LabelTargetIds,
): Promise<{
  data: ProfitLossLabelType[] | null;
  error: PostgrestError | null;
}> => {
  const supabase = createServerSupabase();
  const byColumn = (
    column: "matter_id" | "business_id" | "cost_id" | "recurring_cost_id",
    targetIds: number[],
  ) =>
    fetchAllByIds(targetIds, (chunk, afterId, limit) =>
      supabase
        .from("profit_loss_labels")
        .select("*")
        .in(column, chunk)
        .gt("id", afterId)
        .order("id", { ascending: true })
        .limit(limit),
    );
  const results = await Promise.all([
    byColumn("matter_id", ids.matterIds),
    byColumn("business_id", ids.businessIds),
    byColumn("cost_id", ids.costIds),
    byColumn("recurring_cost_id", ids.recurringCostIds),
  ]);
  const failed = results.find((result) => result.error);
  if (failed) {
    return { data: null, error: failed.error };
  }
  return {
    data: results.flatMap((result) => result.data ?? []),
    error: null,
  };
};

export type AdjustmentSupplementOptions = {
  month: string;
  includeTeamBreakdown?: boolean;
  includeMonthlyDetails?: boolean;
};

// Fetches the rows for aggregation/display (RLS-filtered). Session cookies use the @supabase/ssr
// format; never mix in a client other than createServerSupabase().
// Restricted to the period plus NULL rows (monthly: one month, annual: 12 months) via one
// Promise.all. Titles need the fetched row IDs, so they take one more round trip (skip with
// includeLabels: false for the annual trend). With `supplement` (monthly), supplement rows for
// adjustments whose target moved outside the period are fetched in parallel with the titles (Need
// determined from fetched rows alone); only supplement matters with unqueried titles add a round trip.
export const fetchReportSourceRows = async (
  period: ReportPeriod,
  options?: {
    includeLabels?: boolean;
    supplement?: AdjustmentSupplementOptions;
  },
): Promise<ReportSourceRows | null> => {
  const sourceRows = await fetchClosingSourceRows(period);
  if (!sourceRows) {
    return null;
  }
  const includeLabels = options?.includeLabels !== false;
  const missingIds = options?.supplement
    ? planAdjustmentSupplement(sourceRows, options.supplement)
    : null;
  if (!includeLabels && !missingIds) {
    return { ...sourceRows, labels: [] };
  }
  const labelTargetIds = collectLabelTargetIds(sourceRows);
  const [labelResult, supplemented] = await Promise.all([
    includeLabels
      ? fetchLabelsByTargetIds(labelTargetIds)
      : Promise.resolve({ data: [] as ProfitLossLabelType[], error: null }),
    missingIds ? fetchAdjustmentTargetRows(missingIds) : null,
  ]);
  if (labelResult.error) {
    console.error("損益レポートのデータ取得に失敗しました:", labelResult.error);
    return null;
  }
  const rows: ReportSourceRows = {
    ...sourceRows,
    labels: labelResult.data ?? [],
  };
  if (supplemented) {
    const newMatterIds = applyAdjustmentSupplement(
      rows,
      supplemented,
      new Set(labelTargetIds.matterIds),
    );
    if (includeLabels) {
      await appendMatterLabels(rows, newMatterIds);
    }
  }
  return rows;
};

type MissingAdjustmentTargetIds = ReturnType<
  typeof collectMissingAdjustmentTargetIds
>;

// Fetches only the missing target rows of adjustments whose row moved outside the period, for label
// resolution, and appends them to rows (usually none = no query). Aggregates are unchanged because
// month bucketing excludes them. Unreadable rows (RLS) fall back to generic labels
// (「売上（ID: X）」). Skipped unless the role computes orphanedAdjustments (same
// needsMonthlyAdjustmentDetails as buildMonthReport). Below: IDs needing supplement; null when not
// needed (role skipped / nothing missing).
const planAdjustmentSupplement = (
  rows: ClosingSourceRows,
  options: AdjustmentSupplementOptions,
): MissingAdjustmentTargetIds | null => {
  if (
    !needsMonthlyAdjustmentDetails({
      includeTeamBreakdown: options.includeTeamBreakdown ?? true,
      includeMonthlyDetails: options.includeMonthlyDetails ?? true,
    })
  ) {
    return null;
  }
  const missingIds = collectMissingAdjustmentTargetIds(
    options.month,
    rows.adjustments,
    new Set(rows.businessRows.map((row) => row.id)),
    new Set(rows.costRows.map((row) => row.id)),
    new Set(rows.recurringCosts.map((rc) => rc.id)),
  );
  if (
    missingIds.businessIds.length === 0 &&
    missingIds.costIds.length === 0 &&
    missingIds.recurringCostIds.length === 0
  ) {
    return null;
  }
  return missingIds;
};

type SupplementedRows = {
  businessRows: BusinessRow[];
  costRows: CostRow[];
  recurringCosts: RecurringCostType[];
};

// null on failure (generic labels are shown).
const fetchAdjustmentTargetRows = async (
  missingIds: MissingAdjustmentTargetIds,
): Promise<SupplementedRows | null> => {
  const supabase = createServerSupabase();
  const [missingBusiness, missingCosts, missingRecurring] = await Promise.all([
    fetchAllByIds(missingIds.businessIds, (chunk, afterId, limit) =>
      supabase
        .from("business")
        .select(BUSINESS_SELECT)
        .in("id", chunk)
        .gt("id", afterId)
        .order("id", { ascending: true })
        .limit(limit),
    ),
    fetchAllByIds(missingIds.costIds, (chunk, afterId, limit) =>
      supabase
        .from("costs")
        .select(COST_SELECT)
        .in("id", chunk)
        .gt("id", afterId)
        .order("id", { ascending: true })
        .limit(limit),
    ),
    fetchAllByIds(missingIds.recurringCostIds, (chunk, afterId, limit) =>
      supabase
        .from("recurring_costs")
        .select("*")
        .in("id", chunk)
        .gt("id", afterId)
        .order("id", { ascending: true })
        .limit(limit),
    ),
  ]);
  if (missingBusiness.error || missingCosts.error || missingRecurring.error) {
    console.error(
      "損益レポートの調整対象行の補完取得に失敗しました（汎用ラベルで表示します）:",
      missingBusiness.error ?? missingCosts.error ?? missingRecurring.error,
    );
    return null;
  }
  return {
    businessRows: (missingBusiness.data ?? []) as BusinessRow[],
    costRows: (missingCosts.data ?? []) as CostRow[],
    recurringCosts: missingRecurring.data ?? [],
  };
};

// Appends supplement rows and returns matter IDs whose titles were not queried yet (titles were
// fetched by the original rows' matter IDs; row/recurring cost titles came via adjustment target IDs).
const applyAdjustmentSupplement = (
  rows: ReportSourceRows,
  supplemented: SupplementedRows,
  queriedMatterIds: ReadonlySet<number>,
): number[] => {
  rows.businessRows.push(...supplemented.businessRows);
  rows.costRows.push(...supplemented.costRows);
  rows.recurringCosts.push(...supplemented.recurringCosts);
  return Array.from(
    new Set(
      [...supplemented.businessRows, ...supplemented.costRows]
        .map((row) => row.matter_id)
        .filter((id) => !queriedMatterIds.has(id)),
    ),
  );
};

const appendMatterLabels = async (
  rows: ReportSourceRows,
  matterIds: number[],
): Promise<void> => {
  if (matterIds.length === 0) {
    return;
  }
  const labelResult = await fetchLabelsByTargetIds({
    matterIds,
    businessIds: [],
    costIds: [],
    recurringCostIds: [],
  });
  if (labelResult.error) {
    console.error(
      "損益レポートの調整対象行の表示タイトルの取得に失敗しました（元の案件名で表示します）:",
      labelResult.error,
    );
    return;
  }
  rows.labels.push(...(labelResult.data ?? []));
};

// Move info for added/removed post-closing diffs:
// - removed: where the line is now (start month / draft; none = deleted)
// - added: other closed months holding the line (move source)
// No query without diffs (context: null; otherwise one round trip). On failure returns failed: true
// so the diff list warns and blocks applying without knowing about moves.
export type DiffMoveContextResult =
  | { context: Parameters<typeof annotateDiffMoves>[1] | null; failed?: false }
  | { context?: undefined; failed: true };

export const fetchDiffMoveContext = async (
  month: string,
  diffs: ClosingDiff[],
): Promise<DiffMoveContextResult> => {
  const removed = diffs.filter((diff) => diff.kind === "removed");
  const added = diffs.filter((diff) => diff.kind === "added");
  if (removed.length === 0 && added.length === 0) {
    return { context: null };
  }
  const idsOf = (list: ClosingDiff[], type: DiffSourceType) =>
    list.filter((diff) => diff.sourceType === type).map((d) => d.sourceId);
  const supabase = createServerSupabase();
  const matterColumns = "matter_id, matters!inner(start_date, is_fixed, is_completed)";
  const removedBusinessIds = idsOf(removed, "business");
  const removedCostIds = idsOf(removed, "cost");
  const addedIds = added.map((diff) => diff.sourceId);
  // Chunk and page ids (fetchAllByIds) so mass diffs (e.g. bulk send-back) are not cut off by max_rows.
  const [businessResult, costResult, otherLinesResult, closingsResult] =
    await Promise.all([
      fetchAllByIds(removedBusinessIds, (chunk, afterId, limit) =>
        supabase
          .from("business")
          .select(`id, ${matterColumns}`)
          .in("id", chunk)
          .gt("id", afterId)
          .order("id", { ascending: true })
          .limit(limit),
      ),
      fetchAllByIds(removedCostIds, (chunk, afterId, limit) =>
        supabase
          .from("costs")
          .select(`id, ${matterColumns}`)
          .in("id", chunk)
          .gt("id", afterId)
          .order("id", { ascending: true })
          .limit(limit),
      ),
      fetchAllByIds(addedIds, (chunk, afterId, limit) =>
        supabase
          .from("profit_loss_closing_lines")
          .select(
            "id, source_type, source_id, profit_loss_closings!inner(target_month)",
          )
          .in("source_type", ["business", "cost"])
          .in("source_id", chunk)
          .neq("profit_loss_closings.target_month", toFirstOfMonth(month))
          .gt("id", afterId)
          .order("id", { ascending: true })
          .limit(limit),
      ),
      fetchClosedMonthKeys(),
    ]);
  const error =
    businessResult.error ??
    costResult.error ??
    otherLinesResult.error ??
    closingsResult.error;
  if (error) {
    console.error("確定後の差分の移動元・移動先の取得に失敗しました:", error);
    return { failed: true };
  }

  type LocatedRow = {
    id: number;
    matters: { start_date: string | null; is_fixed: boolean | null; is_completed: boolean | null };
  };
  const liveLocations = new Map<string, { month: string | null; isDraft: boolean }>();
  const locate = (type: DiffSourceType, rows: LocatedRow[]) =>
    rows.forEach((row) =>
      liveLocations.set(diffKeyOf(type, row.id), {
        month: matterMonthKey(row.matters),
        isDraft: isDraftMatter(row.matters),
      }),
    );
  locate("business", (businessResult.data ?? []) as LocatedRow[]);
  locate("cost", (costResult.data ?? []) as LocatedRow[]);

  const addedKeys = new Set(added.map((diff) => diff.key));
  const otherClosedMonths = new Map<string, string[]>();
  (
    (otherLinesResult.data ?? []) as {
      source_type: string;
      source_id: number;
      profit_loss_closings: { target_month: string };
    }[]
  ).forEach((row) => {
    const key = diffKeyOf(row.source_type as DiffSourceType, row.source_id);
    if (!addedKeys.has(key)) return; // Excludes rows of the other type whose business / cost IDs collide.
    const months = otherClosedMonths.get(key) ?? [];
    months.push(row.profit_loss_closings.target_month.slice(0, 7));
    otherClosedMonths.set(key, months.sort());
  });

  return {
    context: {
      liveLocations,
      otherClosedMonths,
      closedMonths: new Set(closingsResult.months ?? []),
    },
  };
};
