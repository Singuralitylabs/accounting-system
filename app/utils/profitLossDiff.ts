// Detects post-closing changes by matching closing lines against live lines on
// (source_type, source_id); no DB triggers or change flags. Only matter sales/cost lines are
// covered (recurring cost changes never reach closed months; adjustments and extra entries are
// locked while closed).

import {
  ClosingDiff,
  ClosingDiffKey,
  ClosingDiffResult,
  ClosingDiffSelection,
  ClosingLineInput,
  DiffLineState,
  DiffSourceType,
  PLMonthLines,
  PLReportType,
  ProfitLossClosingDismissalType,
  RemovedReason,
} from "../types/types";
import { LabelIndex, buildLabelIndex } from "./profitLossLogic";
import { addMonths } from "./formatter";

export const diffKeyOf = (sourceType: DiffSourceType, sourceId: number) =>
  `${sourceType}:${sourceId}`;

export const parseDiffKey = (key: string): ClosingDiffKey | null => {
  const [sourceType, id] = key.split(":");
  const sourceId = Number(id);
  if (
    (sourceType !== "business" && sourceType !== "cost") ||
    !Number.isInteger(sourceId)
  ) {
    return null;
  }
  return { sourceType, sourceId };
};

// numeric(15,2): compare in sen units to avoid false diffs from float error.
const toCents = (value: number) => Math.round(value * 100);

type ComparableLine = DiffLineState & {
  sourceType: DiffSourceType;
  sourceId: number;
  matterId: number;
  matterTitle: string;
  name: string;
  item: string | null;
};

const liveComparableLines = (lines: PLMonthLines): ComparableLine[] => [
  ...lines.businesses.map((line) => ({
    sourceType: "business" as const,
    sourceId: line.businessId,
    matterId: line.matterId,
    matterTitle: line.matterTitle,
    name: line.name,
    item: null,
    actualAmount: line.actualAmount,
    team: line.team,
    category: line.category,
  })),
  ...lines.costs.map((line) => ({
    sourceType: "cost" as const,
    sourceId: line.costId,
    matterId: line.matterId,
    matterTitle: line.matterTitle,
    name: line.name,
    item: line.item,
    actualAmount: line.actualAmount,
    team: line.team,
    category: line.category,
  })),
];

const closedComparableLines = (rows: ClosingLineInput[]): ComparableLine[] =>
  rows
    .filter(
      (row): row is ClosingLineInput & { source_type: DiffSourceType } =>
        row.source_type === "business" || row.source_type === "cost",
    )
    .map((row) => ({
      sourceType: row.source_type,
      sourceId: row.source_id,
      matterId: row.matter_id ?? 0,
      matterTitle: row.matter_title ?? "",
      name: row.name,
      item: row.item,
      actualAmount: Number(row.actual_amount ?? 0),
      team: row.team ?? "",
      category: row.category ?? "",
    }));

export type LiveDiffState = {
  present: boolean;
  actualAmount: number | null;
  team: string | null;
  category: string | null;
};

const liveStateOf = (line: ComparableLine | undefined): LiveDiffState =>
  line
    ? {
        present: true,
        actualAmount: line.actualAmount,
        team: line.team,
        category: line.category,
      }
    : { present: false, actualAmount: null, team: null, category: null };

const sameLiveState = (
  dismissal: Pick<
    ProfitLossClosingDismissalType,
    "live_present" | "live_actual_amount" | "live_team" | "live_category"
  >,
  state: LiveDiffState,
): boolean =>
  dismissal.live_present === state.present &&
  (state.present
    ? dismissal.live_actual_amount !== null &&
      toCents(Number(dismissal.live_actual_amount)) ===
        toCents(state.actualAmount ?? 0) &&
      dismissal.live_team === state.team &&
      dismissal.live_category === state.category
    : true);

export const liveDiffStates = (
  liveLines: PLMonthLines,
  keys: ClosingDiffKey[],
): (ClosingDiffKey & LiveDiffState)[] => {
  const byKey = new Map(
    liveComparableLines(liveLines).map((line) => [
      diffKeyOf(line.sourceType, line.sourceId),
      line,
    ]),
  );
  return keys.map((key) => ({
    ...key,
    ...liveStateOf(byKey.get(diffKeyOf(key.sourceType, key.sourceId))),
  }));
};

export type DiffClosingLinesInput = {
  liveLines: PLMonthLines;
  closedLines: ClosingLineInput[];
  dismissals: Pick<
    ProfitLossClosingDismissalType,
    | "source_type"
    | "source_id"
    | "live_present"
    | "live_actual_amount"
    | "live_team"
    | "live_category"
    | "dismissed_at"
    | "dismissed_by_name"
  >[];
  labelIndex?: LabelIndex;
};

// added: live only; removed: closing only; changed: actual amount or category/team differs
// (name-only changes are not diffs because names always show the latest).
// A skip record whose live state still matches is "skipped"; if it changed again it is pending.
// Skip records for lines that are no longer diffs are ignored.
export const diffClosingLines = ({
  liveLines,
  closedLines,
  dismissals,
  labelIndex = buildLabelIndex(),
}: DiffClosingLinesInput): ClosingDiffResult => {
  const live = new Map(
    liveComparableLines(liveLines).map((line) => [
      diffKeyOf(line.sourceType, line.sourceId),
      line,
    ]),
  );
  const closed = new Map(
    closedComparableLines(closedLines).map((line) => [
      diffKeyOf(line.sourceType, line.sourceId),
      line,
    ]),
  );
  const dismissalByKey = new Map(
    dismissals.map((dismissal) => [
      diffKeyOf(dismissal.source_type as DiffSourceType, dismissal.source_id),
      dismissal,
    ]),
  );

  const pending: ClosingDiff[] = [];
  const dismissed: ClosingDiff[] = [];
  const keys = new Set([
    ...Array.from(live.keys()),
    ...Array.from(closed.keys()),
  ]);
  keys.forEach((key) => {
    const after = live.get(key);
    const before = closed.get(key);
    const base = (after ?? before)!;
    const amountChanged =
      !!after &&
      !!before &&
      toCents(after.actualAmount) !== toCents(before.actualAmount);
    const classificationChanged =
      !!after &&
      !!before &&
      (after.team !== before.team || after.category !== before.category);
    if (after && before && !amountChanged && !classificationChanged) {
      return;
    }
    const matterTitle =
      labelIndex.matter.get(base.matterId) ?? base.matterTitle;
    const name =
      (base.sourceType === "business"
        ? labelIndex.business.get(base.sourceId)
        : labelIndex.cost.get(base.sourceId)) ?? base.name;
    const diff: ClosingDiff = {
      key,
      sourceType: base.sourceType,
      sourceId: base.sourceId,
      kind: !before ? "added" : !after ? "removed" : "changed",
      amountChanged,
      classificationChanged,
      matterId: base.matterId,
      matterTitle,
      name,
      item: base.item,
      before: before
        ? {
            actualAmount: before.actualAmount,
            team: before.team,
            category: before.category,
          }
        : null,
      after: after
        ? {
            actualAmount: after.actualAmount,
            team: after.team,
            category: after.category,
          }
        : null,
      delta: (after?.actualAmount ?? 0) - (before?.actualAmount ?? 0),
      movedMonth: null,
      movedMonthClosed: false,
      removedReason: null,
      dismissal: null,
    };
    const dismissal = dismissalByKey.get(key);
    if (dismissal && sameLiveState(dismissal, liveStateOf(after))) {
      dismissed.push({
        ...diff,
        dismissal: {
          dismissedAt: dismissal.dismissed_at,
          dismissedByName: dismissal.dismissed_by_name,
        },
      });
    } else {
      pending.push(diff);
    }
  });

  const order = (a: ClosingDiff, b: ClosingDiff) =>
    a.matterId - b.matterId ||
    (a.sourceType === b.sourceType
      ? 0
      : a.sourceType === "business"
        ? -1
        : 1) ||
    a.sourceId - b.sourceId;
  return { pending: pending.sort(order), dismissed: dismissed.sort(order) };
};

// Attaches move/deletion reasons to added/removed diffs.
// liveLocations: removed key -> where the live row is now (none = deleted);
// otherClosedMonths: added key -> other closed months holding that line.
export const annotateDiffMoves = (
  result: ClosingDiffResult,
  context: {
    liveLocations: ReadonlyMap<
      string,
      { month: string | null; isDraft: boolean }
    >;
    otherClosedMonths: ReadonlyMap<string, string[]>;
    closedMonths: ReadonlySet<string>;
  },
): ClosingDiffResult => {
  const annotate = (diff: ClosingDiff): ClosingDiff => {
    if (diff.kind === "removed") {
      const location = context.liveLocations.get(diff.key);
      const removedReason: RemovedReason = !location
        ? "deleted"
        : location.isDraft
          ? "draft"
          : location.month === null
            ? "undated"
            : "moved";
      const movedMonth = removedReason === "moved" ? location!.month : null;
      return {
        ...diff,
        removedReason,
        movedMonth,
        movedMonthClosed: !!movedMonth && context.closedMonths.has(movedMonth),
      };
    }
    if (diff.kind === "added") {
      const movedMonth = context.otherClosedMonths.get(diff.key)?.[0] ?? null;
      return {
        ...diff,
        movedMonth,
        movedMonthClosed: !!movedMonth && context.closedMonths.has(movedMonth),
      };
    }
    return diff;
  };
  return {
    pending: result.pending.map(annotate),
    dismissed: result.dismissed.map(annotate),
  };
};

// Applying diffs: sales diffs go to sales, cost diffs to matter cost. Admin cost is unchanged, so
// ordinary profit delta equals the gross profit delta.
export type DiffImpact = {
  revenue: { before: number; after: number };
  matterCost: { before: number; after: number };
  grossProfit: { before: number; after: number };
  ordinaryProfit: { before: number; after: number };
};

export const computeDiffImpact = (
  report: Pick<
    PLReportType,
    "revenueTotal" | "matterCostTotal" | "grossProfitTotal" | "ordinaryProfit"
  >,
  diffs: ClosingDiff[],
): DiffImpact => {
  const revenueDelta = diffs
    .filter((diff) => diff.sourceType === "business")
    .reduce((sum, diff) => sum + diff.delta, 0);
  const costDelta = diffs
    .filter((diff) => diff.sourceType === "cost")
    .reduce((sum, diff) => sum + diff.delta, 0);
  const grossDelta = revenueDelta - costDelta;
  return {
    revenue: {
      before: report.revenueTotal,
      after: report.revenueTotal + revenueDelta,
    },
    matterCost: {
      before: report.matterCostTotal,
      after: report.matterCostTotal + costDelta,
    },
    grossProfit: {
      before: report.grossProfitTotal,
      after: report.grossProfitTotal + grossDelta,
    },
    ordinaryProfit: {
      before: report.ordinaryProfit,
      after: report.ordinaryProfit + grossDelta,
    },
  };
};

// Live lines are upserted, missing ones deleted. Values must come from server-recomputed
// liveLines, never from the client.
export const buildApplyPayload = (
  liveLines: PLMonthLines,
  keys: ClosingDiffKey[],
): {
  upsertLines: PLMonthLines;
  deleteKeys: { source_type: DiffSourceType; source_id: number }[];
} => {
  const selected = new Set(
    keys.map((key) => diffKeyOf(key.sourceType, key.sourceId)),
  );
  const businesses = liveLines.businesses.filter((line) =>
    selected.has(diffKeyOf("business", line.businessId)),
  );
  const costs = liveLines.costs.filter((line) =>
    selected.has(diffKeyOf("cost", line.costId)),
  );
  const present = new Set([
    ...businesses.map((line) => diffKeyOf("business", line.businessId)),
    ...costs.map((line) => diffKeyOf("cost", line.costId)),
  ]);
  return {
    upsertLines: { businesses, costs, recurringCosts: [], extraEntries: [] },
    deleteKeys: keys
      .filter((key) => !present.has(diffKeyOf(key.sourceType, key.sourceId)))
      .map((key) => ({ source_type: key.sourceType, source_id: key.sourceId })),
  };
};

export const diffKindLabel = (diff: ClosingDiff): string => {
  if (diff.kind === "added") return "追加";
  if (diff.kind === "removed") return "削除";
  const labels = [
    ...(diff.amountChanged ? ["金額変更"] : []),
    ...(diff.classificationChanged ? ["区分変更"] : []),
  ];
  return labels.join("・");
};

// Deduplicates; null if any value is invalid.
export const sanitizeDiffKeys = (keys: unknown): ClosingDiffKey[] | null => {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 5000) {
    return null;
  }
  const result = new Map<string, ClosingDiffKey>();
  for (const key of keys) {
    const sourceType = (key as ClosingDiffKey | null)?.sourceType;
    const sourceId = (key as ClosingDiffKey | null)?.sourceId;
    if (
      (sourceType !== "business" && sourceType !== "cost") ||
      typeof sourceId !== "number" ||
      !Number.isSafeInteger(sourceId) ||
      sourceId <= 0
    ) {
      return null;
    }
    result.set(diffKeyOf(sourceType, sourceId), { sourceType, sourceId });
  }
  return Array.from(result.values());
};

export const toDiffSelection = (diff: ClosingDiff): ClosingDiffSelection => ({
  sourceType: diff.sourceType,
  sourceId: diff.sourceId,
  expected: diff.after
    ? {
        present: true,
        actualAmount: diff.after.actualAmount,
        team: diff.after.team,
        category: diff.after.category,
      }
    : { present: false, actualAmount: null, team: null, category: null },
});

// Null if any selection is invalid.
export const sanitizeDiffSelections = (
  selections: unknown,
): ClosingDiffSelection[] | null => {
  if (!Array.isArray(selections)) return null;
  const keys = sanitizeDiffKeys(selections);
  if (!keys || keys.length !== selections.length) return null;
  const result: ClosingDiffSelection[] = [];
  for (let index = 0; index < selections.length; index++) {
    const expected = (selections[index] as ClosingDiffSelection | null)
      ?.expected;
    if (
      !expected ||
      typeof expected.present !== "boolean" ||
      (expected.present
        ? typeof expected.actualAmount !== "number" ||
          !Number.isFinite(expected.actualAmount) ||
          typeof expected.team !== "string" ||
          typeof expected.category !== "string"
        : expected.actualAmount !== null ||
          expected.team !== null ||
          expected.category !== null)
    ) {
      return null;
    }
    result.push({ ...keys[index], expected });
  }
  return result;
};

// Returns selections whose displayed state differs from the server's current state (changed after
// display). Any hit makes apply/skip reject and ask for a reload.
export const findStaleSelections = (
  liveLines: PLMonthLines,
  selections: ClosingDiffSelection[],
): ClosingDiffKey[] => {
  const states = liveDiffStates(liveLines, selections);
  return selections
    .filter((selection, index) => {
      const state = states[index];
      const expected = selection.expected;
      if (state.present !== expected.present) return true;
      if (!state.present) return false;
      return (
        toCents(state.actualAmount ?? 0) !==
          toCents(expected.actualAmount ?? 0) ||
        state.team !== expected.team ||
        state.category !== expected.category
      );
    })
    .map(({ sourceType, sourceId }) => ({ sourceType, sourceId }));
};

// Months covered by the closing-diff count summary (current month plus the previous 23).
// The summary fetches live rows, closing lines and skip records for every covered month, so
// covering all closed months would grow unbounded. 24 months always includes the whole previous
// fiscal year (July - June), so filing/settlement periods do not miss its changes. Months outside
// still show their diff list in the monthly tab (monthly report always computes it).
export const CLOSING_DIFF_SUMMARY_MONTHS = 24;

// Start month of the summary (23 months before the current month). Closed months after it count.
export const closingDiffSummaryStartMonth = (currentMonth: string): string =>
  addMonths(currentMonth, -(CLOSING_DIFF_SUMMARY_MONTHS - 1));
