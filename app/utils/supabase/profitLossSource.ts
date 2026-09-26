// 損益計算書の集計元データの取得（サーバ専用）。
// 損益レポートの取得（profitLossReport.ts）と月次収支確定（profitLossClosings.ts）の
// 両方で同じ行を同じ条件で取得するために切り出している。
// "use server" を付けないのは、この関数群を Server Action としてクライアントへ
// 公開しないため（requestCache.ts / viewerAccess.ts と同じ）。サーバ専用モジュールからのみ import する。

import {
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
  matterPeriodFilter,
  recurringOverlapEndFilter,
  reportRangeBounds,
} from "../profitLossLogic";
import {
  MonthClosingSnapshot,
  stripClosingLineIds,
} from "../profitLossClosing";
import { createServerSupabase } from "./clients";
import { getActiveSelectOptionsByType } from "./selectOptionsCache";

// business / costs の取得列。計上月（案件開始日）・下書き判定・ラベル解決に
// matters の列を使うため join を含む。通常取得と orphanedAdjustments 用の補完取得で同じ形を使う。
// matters は !inner（inner join）にし、埋め込み側の絞り込み（matterPeriodFilter）で
// 親の business / costs 行を絞れるようにする。
const MATTER_COLUMNS =
  "matters!inner(id, title, team, category, start_date, is_fixed, is_completed)";
export const BUSINESS_SELECT = `id, name, amount, matter_id, ${MATTER_COLUMNS}`;
export const COST_SELECT = `id, name, price, item, matter_id, ${MATTER_COLUMNS}`;

export type ReportSourceRows = {
  teamOrder: string[];
  businessRows: BusinessRow[];
  costRows: CostRow[];
  recurringCosts: RecurringCostType[];
  extraEntries: ExtraEntryType[];
  adjustments: ProfitLossAdjustmentType[];
  labels: ProfitLossLabelType[];
  // 確定済みの月（"YYYY-MM"）→ 確定スナップショット（Issue #148）
  closings: Map<string, MonthClosingSnapshot>;
};

// 集計に必要な行をまとめて取得する（RLS により権限に応じた行のみ返る）
// セッション Cookie は @supabase/ssr 形式。createServerSupabase() 以外のクライアントを混ぜない
// 対象期間＋月未確定（NULL）行に絞る。月次は単月、年間推移は年度12ヶ月を渡し、
// いずれも一括取得（Promise.all）のままクエリ往復を増やさない。
export const fetchReportSourceRows = async (
  period: ReportPeriod,
): Promise<ReportSourceRows | null> => {
  const supabase = createServerSupabase();
  const bounds = reportRangeBounds(period);

  // 案件の売上・費用は案件開始日の月に計上し、下書きの案件は除外する（Issue #146）。
  // 条件は埋め込みリソース（matters!inner）側に掛ける
  const businessQuery = supabase
    .from("business")
    .select(BUSINESS_SELECT)
    .or(matterPeriodFilter(bounds), { referencedTable: "matters" });
  const costQuery = supabase
    .from("costs")
    .select(COST_SELECT)
    .or(matterPeriodFilter(bounds), { referencedTable: "matters" });
  // 定期費用は適用期間の重なりで絞る（支払サイクルの計上判定は集計側で行う）。
  // 適用期間が取得期間と重ならない行だけを除外する。
  const recurringQuery = supabase
    .from("recurring_costs")
    .select("*")
    .lt("start_month", bounds.endExclusive)
    .or(recurringOverlapEndFilter(bounds))
    .order("id", { ascending: true });
  const extraQuery = supabase
    .from("extra_entries")
    .select("*")
    .or(datedOrUndatedFilter("entry_date", bounds))
    .order("id", { ascending: true });
  // 調整は対象月で絞る（target_month は NOT NULL）。
  const adjustmentQuery = supabase
    .from("profit_loss_adjustments")
    .select("*")
    .gte("target_month", bounds.startDate)
    .lt("target_month", bounds.endExclusive)
    .order("id", { ascending: true });
  // 表示タイトル（Issue #150）は全月共通のため期間で絞らない（件数は対象行数以下）
  const labelQuery = supabase
    .from("profit_loss_labels")
    .select("*")
    .order("id", { ascending: true });
  // 確定ヘッダ＋明細（Issue #148）。明細は RLS によりチームリーダーは自チーム＋全体共通のみ
  const closingQuery = supabase
    .from("profit_loss_closings")
    .select("*, profit_loss_closing_lines(*)")
    .gte("target_month", bounds.startDate)
    .lt("target_month", bounds.endExclusive);

  const [
    businessResult,
    costResult,
    recurringResult,
    extraResult,
    adjustmentResult,
    labelResult,
    closingResult,
    teamOptions,
  ] = await Promise.all([
    businessQuery,
    costQuery,
    recurringQuery,
    extraQuery,
    adjustmentQuery,
    labelQuery,
    closingQuery,
    // 案件別収支のチームの並び順（項目管理のチームマスタの display_order 順）
    getActiveSelectOptionsByType(["team"]),
  ]);

  const error =
    businessResult.error ??
    costResult.error ??
    recurringResult.error ??
    extraResult.error ??
    adjustmentResult.error ??
    labelResult.error ??
    closingResult.error;
  if (error) {
    console.error("損益レポートのデータ取得に失敗しました:", error);
    return null;
  }
  // 並び順の取得失敗は集計値に影響しないため致命的にはしない（チーム名順で表示する）
  if (teamOptions.error) {
    console.error(
      "損益レポートのチーム並び順の取得に失敗しました（チーム名順で表示します）:",
      teamOptions.error,
    );
  }

  const closings = new Map<string, MonthClosingSnapshot>();
  (closingResult.data ?? []).forEach(
    ({ profit_loss_closing_lines: lines, ...header }) => {
      closings.set(header.target_month.slice(0, 7), {
        header,
        lines: stripClosingLineIds(lines ?? []),
      });
    },
  );

  return {
    teamOrder: (teamOptions.optionsByType.team ?? []).map(
      (option) => option.value,
    ),
    businessRows: (businessResult.data ?? []) as BusinessRow[],
    costRows: (costResult.data ?? []) as CostRow[],
    recurringCosts: recurringResult.data ?? [],
    extraEntries: extraResult.data ?? [],
    adjustments: adjustmentResult.data ?? [],
    labels: labelResult.data ?? [],
    closings,
  };
};

// 対象行が取得期間外へ移動した調整のラベル解決用に、欠けている対象行だけを
// ID 指定で補完取得し rows に追加する（通常は0件でクエリを発行しない。あっても1往復にまとめる）。
// 補完行は月振り分けで集計から除外されるため集計値は不変。
// RLS で読めない行は解決できず汎用表示（「売上（ID: X）」等）に落ちる。
export const supplementAdjustmentTargets = async (
  month: string,
  rows: ReportSourceRows,
): Promise<void> => {
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
    missingIds.businessIds.length > 0
      ? supabase
          .from("business")
          .select(BUSINESS_SELECT)
          .in("id", missingIds.businessIds)
      : Promise.resolve({ data: [], error: null }),
    missingIds.costIds.length > 0
      ? supabase.from("costs").select(COST_SELECT).in("id", missingIds.costIds)
      : Promise.resolve({ data: [], error: null }),
    missingIds.recurringCostIds.length > 0
      ? supabase
          .from("recurring_costs")
          .select("*")
          .in("id", missingIds.recurringCostIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (missingBusiness.error || missingCosts.error || missingRecurring.error) {
    console.error(
      "損益レポートの調整対象行の補完取得に失敗しました（汎用ラベルで表示します）:",
      missingBusiness.error ?? missingCosts.error ?? missingRecurring.error,
    );
    return;
  }
  rows.businessRows.push(...((missingBusiness.data ?? []) as BusinessRow[]));
  rows.costRows.push(...((missingCosts.data ?? []) as CostRow[]));
  rows.recurringCosts.push(...(missingRecurring.data ?? []));
};
