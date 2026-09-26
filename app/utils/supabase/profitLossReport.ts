"use server";

import {
  AnnualTrendType,
  MatterInfoWithUserNameType,
  PLReportType,
} from "../../types/types";
import { PL_ALLOWED_CLASSES } from "../permissions";
import { createServerSupabase } from "./clients";
import {
  BusinessRow,
  CostRow,
  ReportPeriod,
  buildMonthlyReport,
  collectMissingAdjustmentTargetIds,
  datedOrUndatedFilter,
  fiscalYearMonths,
  isMonthKey,
  matterPeriodFilter,
  recurringOverlapEndFilter,
  reportFlags,
  reportRangeBounds,
} from "../profitLossLogic";
import { getActiveSelectOptionsByType } from "./selectOptionsCache";
import { getAuthorizedViewer } from "./viewerAccess";

// business / costs の取得列。計上月（案件開始日）・下書き判定・ラベル解決に
// matters の列を使うため join を含む。通常取得と orphanedAdjustments 用の補完取得で同じ形を使う。
// matters は !inner（inner join）にし、埋め込み側の絞り込み（matterPeriodFilter）で
// 親の business / costs 行を絞れるようにする。
const MATTER_COLUMNS =
  "matters!inner(id, title, team, category, start_date, is_fixed, is_completed)";
const BUSINESS_SELECT = `id, name, amount, matter_id, ${MATTER_COLUMNS}`;
const COST_SELECT = `id, name, price, item, matter_id, ${MATTER_COLUMNS}`;

// 集計に必要な行をまとめて取得する（RLS により権限に応じた行のみ返る）
// セッション Cookie は @supabase/ssr 形式。createServerSupabase() 以外のクライアントを混ぜない
// period を渡すと対象期間＋月未確定（NULL）行に絞る。月次は単月、年間推移は年度12ヶ月を渡し、
// いずれも一括取得（Promise.all）のままクエリ往復を増やさない。
// 省略時は全件取得（後方互換。呼び出し側は原則として期間を渡す）。
const fetchReportSourceRows = async (period?: ReportPeriod) => {
  const supabase = createServerSupabase();
  const bounds = period ? reportRangeBounds(period) : null;

  let businessQuery = supabase.from("business").select(BUSINESS_SELECT);
  let costQuery = supabase.from("costs").select(COST_SELECT);
  let recurringQuery = supabase
    .from("recurring_costs")
    .select("*")
    .order("id", { ascending: true });
  let extraQuery = supabase
    .from("extra_entries")
    .select("*")
    .order("id", { ascending: true });
  let adjustmentQuery = supabase
    .from("profit_loss_adjustments")
    .select("*")
    .order("id", { ascending: true });
  // 表示タイトル（Issue #150）は全月共通のため期間で絞らない（件数は対象行数以下）
  const labelQuery = supabase
    .from("profit_loss_labels")
    .select("*")
    .order("id", { ascending: true });

  if (bounds) {
    // 案件の売上・費用は案件開始日の月に計上し、下書きの案件は除外する（Issue #146）。
    // 条件は埋め込みリソース（matters!inner）側に掛ける
    businessQuery = businessQuery.or(matterPeriodFilter(bounds), {
      referencedTable: "matters",
    });
    costQuery = costQuery.or(matterPeriodFilter(bounds), {
      referencedTable: "matters",
    });
    extraQuery = extraQuery.or(datedOrUndatedFilter("entry_date", bounds));
    // 定期費用は適用期間の重なりで絞る（支払サイクルの計上判定は集計側で行う）。
    // 適用期間が取得期間と重ならない行だけを除外する。
    recurringQuery = recurringQuery
      .lt("start_month", bounds.endExclusive)
      .or(recurringOverlapEndFilter(bounds));
    // 調整は対象月で絞る（target_month は NOT NULL）。
    adjustmentQuery = adjustmentQuery
      .gte("target_month", bounds.startDate)
      .lt("target_month", bounds.endExclusive);
  }

  const [
    businessResult,
    costResult,
    recurringResult,
    extraResult,
    adjustmentResult,
    labelResult,
    teamOptions,
  ] = await Promise.all([
    businessQuery,
    costQuery,
    recurringQuery,
    extraQuery,
    adjustmentQuery,
    labelQuery,
    // 案件別収支のチームの並び順（項目管理のチームマスタの display_order 順）
    getActiveSelectOptionsByType(["team"]),
  ]);

  if (
    businessResult.error ||
    costResult.error ||
    recurringResult.error ||
    extraResult.error ||
    adjustmentResult.error ||
    labelResult.error
  ) {
    console.error(
      "損益レポートのデータ取得に失敗しました:",
      businessResult.error ??
        costResult.error ??
        recurringResult.error ??
        extraResult.error ??
        adjustmentResult.error ??
        labelResult.error,
    );
    return null;
  }
  // 並び順の取得失敗は集計値に影響しないため致命的にはしない（チーム名順で表示する）
  if (teamOptions.error) {
    console.error(
      "損益レポートのチーム並び順の取得に失敗しました（チーム名順で表示します）:",
      teamOptions.error,
    );
  }

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
  };
};

// 月次損益レポートの取得（month: "YYYY-MM"）
export const getProfitLossReport = async (
  month: string,
): Promise<PLReportType | null> => {
  // 不正な月キーは沈黙の空表示にせず取得失敗として扱う（呼び出し元が再取得を促す）
  if (!isMonthKey(month)) {
    console.error(`損益レポートの対象月の形式が不正です: ${month}`);
    return null;
  }
  // 取得失敗・権限不足はどちらも null（呼び出し元が再取得を促す）
  const { profileInfo } = await getAuthorizedViewer(
    PL_ALLOWED_CLASSES,
    "損益レポート",
  );
  if (!profileInfo) {
    return null;
  }

  const rows = await fetchReportSourceRows({
    startMonth: month,
    endMonth: month,
  });
  if (!rows) {
    return null;
  }

  // 対象行が取得期間外へ移動した調整のラベル解決用に、欠けている対象行だけを
  // ID 指定で補完取得する（通常は0件でクエリを発行しない。あっても1往復にまとめる）。
  // 補完行は月振り分けで集計から除外されるため集計値は不変。
  // RLS で読めない行は解決できず汎用表示（「売上（ID: X）」等）に落ちる。
  const missingIds = collectMissingAdjustmentTargetIds(
    month,
    rows.adjustments,
    new Set(rows.businessRows.map((row) => row.id)),
    new Set(rows.costRows.map((row) => row.id)),
    new Set(rows.recurringCosts.map((rc) => rc.id)),
  );
  if (
    missingIds.businessIds.length > 0 ||
    missingIds.costIds.length > 0 ||
    missingIds.recurringCostIds.length > 0
  ) {
    const supabase = createServerSupabase();
    const [missingBusiness, missingCosts, missingRecurring] = await Promise.all(
      [
        missingIds.businessIds.length > 0
          ? supabase
              .from("business")
              .select(BUSINESS_SELECT)
              .in("id", missingIds.businessIds)
          : Promise.resolve({ data: [], error: null }),
        missingIds.costIds.length > 0
          ? supabase
              .from("costs")
              .select(COST_SELECT)
              .in("id", missingIds.costIds)
          : Promise.resolve({ data: [], error: null }),
        missingIds.recurringCostIds.length > 0
          ? supabase
              .from("recurring_costs")
              .select("*")
              .in("id", missingIds.recurringCostIds)
          : Promise.resolve({ data: [], error: null }),
      ],
    );
    if (missingBusiness.error || missingCosts.error || missingRecurring.error) {
      console.error(
        "損益レポートの調整対象行の補完取得に失敗しました（汎用ラベルで表示します）:",
        missingBusiness.error ?? missingCosts.error ?? missingRecurring.error,
      );
    } else {
      rows.businessRows.push(...((missingBusiness.data ?? []) as BusinessRow[]));
      rows.costRows.push(...((missingCosts.data ?? []) as CostRow[]));
      rows.recurringCosts.push(...(missingRecurring.data ?? []));
    }
  }

  return buildMonthlyReport({
    month,
    businessRows: rows.businessRows,
    costRows: rows.costRows,
    recurringCosts: rows.recurringCosts,
    extraEntries: rows.extraEntries,
    adjustments: rows.adjustments,
    teamOrder: rows.teamOrder,
    labels: rows.labels,
    includeOrphanedAdjustments: true,
    ...reportFlags(profileInfo.class),
  });
};

// 年間推移の取得（fiscalYear: 年度の開始年。2026 = 2026/7〜2027/6）
export const getAnnualTrend = async (
  fiscalYear: number,
): Promise<AnnualTrendType | null> => {
  // 不正な年度は沈黙の空表示にせず取得失敗として扱う（呼び出し元が再取得を促す）
  if (!Number.isInteger(fiscalYear)) {
    console.error(`年間推移の年度の形式が不正です: ${fiscalYear}`);
    return null;
  }
  const { profileInfo } = await getAuthorizedViewer(
    PL_ALLOWED_CLASSES,
    "損益レポート",
  );
  if (!profileInfo) {
    return null;
  }

  // 年度の全期間を 1 回のクエリで取得し、月別にバケット分けする
  // （月単位まで絞ると12回クエリになるため年度範囲で絞る）
  const months = fiscalYearMonths(fiscalYear);
  const rows = await fetchReportSourceRows({
    startMonth: months[0],
    endMonth: months[months.length - 1],
  });
  if (!rows) {
    return null;
  }

  const trendMonths = months.map((month) =>
    buildMonthlyReport({
      month,
      businessRows: rows.businessRows,
      costRows: rows.costRows,
      recurringCosts: rows.recurringCosts,
      extraEntries: rows.extraEntries,
      adjustments: rows.adjustments,
      teamOrder: rows.teamOrder,
      labels: rows.labels,
      // 年間推移は orphanedAdjustments を表示に使わないため 12ヶ月分の
      // 無駄な計算を避ける（AnnualTrendTable は参照しない）
      includeOrphanedAdjustments: false,
      ...reportFlags(profileInfo.class),
    }),
  );

  return { fiscalYear, months: trendMonths };
};

// 案件情報の単体取得（損益計算書の「案件を表示」ボタン → 案件詳細モーダル用）
export const getMatterInfoById = async (matterId: number) => {
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from("matters")
    .select(
      `
      *,
      profiles!matters_user_id_fkey (
        name,
        slack_id
      )
    `,
    )
    .eq("id", matterId)
    .single();

  if (error || !data) {
    console.error(`案件ID : ${matterId}の案件情報の取得に失敗しました。`, error);
    return { matterInfo: null, error };
  }

  const { profiles, ...matter } = data;
  const matterInfo: MatterInfoWithUserNameType = {
    ...matter,
    user_name: profiles?.name ?? null,
    slack_id: profiles?.slack_id ?? null,
  };

  return { matterInfo, error: null };
};
