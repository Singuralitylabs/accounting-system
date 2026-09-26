// 損益計算書の確定後の変更検知・反映・見送り（Issue #149）の純粋関数。
// 確定明細（profit_loss_closing_lines）と当月のライブ集計の明細を
// (source_type, source_id) で突き合わせて差分を算出する。DB トリガーや変更フラグは使わない。
// 対象は案件の売上・費用の明細のみ（定期費用マスタの変更は確定済みの月に反映せず
// アラートも出さない。損益調整・経理追加収支は確定中はロックされ変更できない）。

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

// 金額は numeric(15,2)。浮動小数の誤差で差分を誤検知しないよう銭単位で比較する
const toCents = (value: number) => Math.round(value * 100);

// 比較・表示用に正規化した明細（ライブ・確定の共通形）
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

// 見送り記録と比較するライブの状態
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

// 当月のライブの明細から、指定キーのライブの状態を求める（見送りの保存に使う）
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
  liveLines: PLMonthLines; // 当月のライブの明細（buildLiveMonthLines の結果）
  closedLines: ClosingLineInput[]; // 当月の確定明細
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

// 確定明細とライブの明細の差分を算出する。
// - 追加: ライブにのみある（確定後に経理申請された / 明細が追加された / 他月から移ってきた）
// - 削除: 確定明細にのみある（案件・明細の削除 / 下書きに戻された / 他月へ移った）
// - 変更: 両方にあり、実績額（金額変更・調整の消滅）または分類・チーム（区分変更）が異なる
// 名称だけの変更は差分にしない（名称は常に最新を表示するため）。
// 見送り記録があり、見送った時点のライブの状態が現在と一致するものは見送り済みに、
// 一致しない（見送り後にさらに変更された）ものは未処理に分ける。差分でなくなった
// （元データが確定値に戻った）明細の見送り記録は無視する
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
      return; // 差分なし（名称だけの変更を含む）
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

// 追加・削除の差分に、他の月との移動（案件開始日の変更）・削除の理由を付ける。
// liveLocations: 削除の差分のキー → 現在のライブの行の所在（行が無ければ削除済み）
// otherClosedMonths: 追加の差分のキー → その明細を確定明細に持つ他の確定済みの月
// closedMonths: 確定済みの月の集合（移動先・移動元が確定済みかの判定）
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

// 選択した差分を反映した場合の影響額（確定値 → 反映後）。
// 売上明細の差は売上、費用明細の差は案件費用へ。管理費は変わらないため
// 経常利益の差は粗利の差と同じ
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

// 選択した差分を反映するための確定明細の変更内容。
// ライブにある明細（追加・変更）は最新の値で upsert、無い明細（削除）は delete する。
// 値は必ずサーバ側でライブ集計し直した liveLines から作る（クライアントの値は使わない）
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

// 差分の種類の表示名
export const diffKindLabel = (diff: ClosingDiff): string => {
  if (diff.kind === "added") return "追加";
  if (diff.kind === "removed") return "削除";
  const labels = [
    ...(diff.amountChanged ? ["金額変更"] : []),
    ...(diff.classificationChanged ? ["区分変更"] : []),
  ];
  return labels.join("・");
};

// Server Action に渡された差分キーの検証（重複除去）。不正な値が 1 つでもあれば null
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

// 差分一覧で選んだ明細の、画面に表示していた最新の状態（反映・見送りの Server Action に渡す）
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

// Server Action に渡された選択（キー＋画面で見ていた状態）の検証。不正な値があれば null
export const sanitizeDiffSelections = (
  selections: unknown,
): ClosingDiffSelection[] | null => {
  if (!Array.isArray(selections)) return null;
  const keys = sanitizeDiffKeys(selections);
  if (!keys || keys.length !== selections.length) return null; // 重複も不正とする
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

// 画面で見ていた状態と、サーバで集計し直した現在の状態が食い違う選択（表示後に
// さらに変更された明細）を返す。1 件でもあれば反映・見送りを拒否し、再読み込みを促す
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
