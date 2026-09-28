// 損益計算書の集計元データの取得（サーバ専用）。
// 損益レポートの取得（profitLossReport.ts）と月次収支確定（profitLossClosings.ts）の
// 両方で同じ行を同じ条件で取得するために切り出している。
// "use server" を付けないのは、この関数群を Server Action としてクライアントへ
// 公開しないため（requestCache.ts / viewerAccess.ts と同じ）。サーバ専用モジュールからのみ import する。

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

// business / costs の取得列。計上月（案件開始日）・下書き判定・ラベル解決に
// matters の列を使うため join を含む。通常取得と orphanedAdjustments 用の補完取得で同じ形を使う。
// matters は !inner（inner join）にし、埋め込み側の絞り込み（matterPeriodFilter）で
// 親の business / costs 行を絞れるようにする。
const MATTER_COLUMNS =
  "matters!inner(id, user_id, title, team, category, start_date, is_fixed, is_completed)";
export const BUSINESS_SELECT = `id, name, amount, matter_id, ${MATTER_COLUMNS}`;
export const COST_SELECT = `id, name, price, item, matter_id, ${MATTER_COLUMNS}`;

// ライブ集計（buildLiveMonthLines）に必要な行
export type LiveSourceRows = {
  businessRows: BusinessRow[];
  costRows: CostRow[];
  recurringCosts: RecurringCostType[];
  extraEntries: ExtraEntryType[];
  adjustments: ProfitLossAdjustmentType[];
};

export type ReportSourceRows = LiveSourceRows & {
  labels: ProfitLossLabelType[];
  // 確定済みの月（"YYYY-MM"）→ 確定スナップショット（Issue #148）
  closings: Map<string, MonthClosingSnapshot>;
};

// ライブ集計に必要な行だけを取得する（RLS により権限に応じた行のみ返る）。
// 月次収支の確定（スナップショットの保存）はこれだけで足りるため、表示タイトル・確定明細・
// 見送り記録・チームマスタは取得しない。損益レポートの取得（fetchReportSourceRows）も
// これを他の取得と並列に呼ぶ
export const fetchLiveSourceRows = async (
  period: ReportPeriod,
): Promise<LiveSourceRows | null> => {
  const supabase = createServerSupabase();
  const bounds = reportRangeBounds(period);

  // 案件の売上・費用は案件開始日の月に計上し、下書きの案件は除外する（Issue #146）。
  // 条件は埋め込みリソース（matters!inner）側に掛ける
  // 行数が増えうるため fetchAllPages で id 順にページングする（年間推移・確定後の変更の集計は
  // 複数月をまとめて取得するため、max_rows を超えうる）
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
  // 定期費用は適用期間の重なりで絞る（支払サイクルの計上判定は集計側で行う）。
  // 適用期間が取得期間と重ならない行だけを除外する。
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
  // 調整は対象月で絞る（target_month は NOT NULL）。
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

// 確定スナップショット（Issue #148 / #149）: 確定済みの月（"YYYY-MM"）→ ヘッダ・確定明細・見送り記録。
// PostgREST の max_rows は埋め込みリソースの配列にも掛かるため、明細・見送り記録は埋め込まずに
// 別クエリでページングし、ヘッダの月範囲で絞る（!inner の埋め込み側に条件を掛ける）。
// 明細は RLS によりチームリーダーは自チーム＋全体共通（＋自分が作成した案件）のみ、
// 見送り記録は accounting / admin のみ返る
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

  // 明細・見送り記録を確定ヘッダごとにまとめる（埋め込みの target_month は使わない）
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
  // 確定済みの月（"YYYY-MM"）→ 確定スナップショット（Issue #148）
  closings: Map<string, MonthClosingSnapshot>;
};

// ライブの行と確定スナップショットだけを取得する（確定後の差分の件数集計・反映・見送り用。
// 表示タイトル・チームマスタは使わないため取得しない）
export const fetchClosingSourceRows = async (
  period: ReportPeriod,
): Promise<ClosingSourceRows | null> => {
  const [liveRows, closings] = await Promise.all([
    fetchLiveSourceRows(period),
    fetchClosingSnapshots(period),
  ]);
  return liveRows && closings ? { ...liveRows, closings } : null;
};

// 表示タイトル（profit_loss_labels。Issue #150）の取得対象の ID（対象種別ごと）
export type LabelTargetIds = {
  matterIds: number[];
  businessIds: number[];
  costIds: number[];
  recurringCostIds: number[];
};

// 取得した行から、表示タイトルを引く可能性のある対象の ID を集める（Issue #172）。
// 表示タイトルはライブの明細・確定明細（元の行が削除・他月へ移動した明細を含む）・
// 差分一覧・対象行が当月に存在しない調整の表示で引くため、次をすべて含める:
// - 案件: ライブの売上・費用の案件 ID、確定明細（売上・費用）の案件 ID
// - 売上・費用・定期費用: ライブの行の ID、確定明細の source_id、損益調整の対象 ID
// （対象行が期間外へ移動した調整の対象行は supplementAdjustmentTargets で補完取得する）
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

// 表示タイトルを対象 ID で取得する（Issue #172。以前は全月共通のため全件を取得していたが、
// 件数が運用期間に比例して増えるため、表示する期間の明細に対応するものだけを読む）。
// ID が多い場合（年間推移・案件の多い月）も URL の長さと max_rows に掛からないよう
// fetchAllByIds で分割・ページングする。対象種別ごとに並列に問い合わせ、ID が無い種別は
// 問い合わせない（RLS により閲覧できる行のみ返る）
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

// 集計・表示に必要な行をまとめて取得する（RLS により権限に応じた行のみ返る）
// セッション Cookie は @supabase/ssr 形式。createServerSupabase() 以外のクライアントを混ぜない
// 対象期間＋月未確定（NULL）行に絞る。月次は単月、年間推移は年度12ヶ月を渡し、
// いずれも一括取得（Promise.all）のままクエリ往復を増やさない。
// 表示タイトルは取得した行の ID で絞って取得するため、行の取得の後にもう 1 往復する
// （Issue #172）。表示タイトルを表示しない年間推移は includeLabels: false で取得を省く
export const fetchReportSourceRows = async (
  period: ReportPeriod,
  options?: { includeLabels?: boolean },
): Promise<ReportSourceRows | null> => {
  const sourceRows = await fetchClosingSourceRows(period);
  if (!sourceRows) {
    return null;
  }
  if (options?.includeLabels === false) {
    return { ...sourceRows, labels: [] };
  }
  const labelResult = await fetchLabelsByTargetIds(
    collectLabelTargetIds(sourceRows),
  );
  if (labelResult.error) {
    console.error("損益レポートのデータ取得に失敗しました:", labelResult.error);
    return null;
  }
  return {
    ...sourceRows,
    labels: labelResult.data ?? [],
  };
};

// 対象行が取得期間外へ移動した調整のラベル解決用に、欠けている対象行だけを
// ID 指定で補完取得し rows に追加する（通常は0件でクエリを発行しない。あっても1往復にまとめる）。
// 補完行は月振り分けで集計から除外されるため集計値は不変。
// RLS で読めない行は解決できず汎用表示（「売上（ID: X）」等）に落ちる。
// orphanedAdjustments は月次タブの単月表示でチーム別内訳を持つロール
// （accounting / admin）でのみ計算・表示されるため、それ以外では補完取得自体を
// スキップする（Issue #142）。表示側（buildMonthReport）と同じ
// needsMonthlyAdjustmentDetails で判定する
export const supplementAdjustmentTargets = async (
  month: string,
  rows: ReportSourceRows,
  options?: { includeTeamBreakdown?: boolean; includeMonthlyDetails?: boolean },
): Promise<void> => {
  if (
    !needsMonthlyAdjustmentDetails({
      includeTeamBreakdown: options?.includeTeamBreakdown ?? true,
      includeMonthlyDetails: options?.includeMonthlyDetails ?? true,
    })
  ) {
    return;
  }
  const missingIds = collectMissingAdjustmentTargetIds(
    month,
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
    return;
  }
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
    return;
  }
  // 表示タイトルは取得済みの行の案件 ID で絞って取得しているため、補完行の案件のうち
  // まだ問い合わせていない案件の表示タイトルを追加で取得する（Issue #172。明細・定期費用の
  // 表示タイトルは調整の対象 ID として取得済み）。補完行が無ければ問い合わせない
  const queriedMatterIds = new Set(collectLabelTargetIds(rows).matterIds);
  const supplementedBusiness = (missingBusiness.data ?? []) as BusinessRow[];
  const supplementedCosts = (missingCosts.data ?? []) as CostRow[];
  rows.businessRows.push(...supplementedBusiness);
  rows.costRows.push(...supplementedCosts);
  rows.recurringCosts.push(...(missingRecurring.data ?? []));
  const newMatterIds = Array.from(
    new Set(
      [...supplementedBusiness, ...supplementedCosts]
        .map((row) => row.matter_id)
        .filter((id) => !queriedMatterIds.has(id)),
    ),
  );
  if (newMatterIds.length === 0) {
    return;
  }
  const labelResult = await fetchLabelsByTargetIds({
    matterIds: newMatterIds,
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

// 確定後の差分（Issue #149）の追加・削除に付ける、他の月との移動の情報を取得する。
// - 削除の差分: 明細の現在の所在（案件開始日の月・下書きか。行が無ければ削除済み）
// - 追加の差分: その明細を確定明細に持つ他の確定済みの月（移動元）
// 追加・削除の差分が無ければクエリを発行しない（context: null。あっても 1 往復にまとめる）。
// 取得に失敗した場合は failed: true を返す（移動の有無が分からないまま反映させないため、
// 呼び出し側で差分一覧に注意を出し反映を止める）
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
  // 追加・削除の差分が多い月（案件の一括差し戻し等）でも max_rows で打ち切られないよう、
  // ID を分割してページングする（fetchAllByIds。ID が無ければ問い合わせない）
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
    if (!addedKeys.has(key)) return; // business / cost の ID が重なる別種別の行を除く
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
