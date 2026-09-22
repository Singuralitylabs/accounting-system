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
  datedOrUndatedFilter,
  fiscalYearMonths,
  isMonthKey,
  recurringOverlapEndFilter,
  reportFlags,
  reportRangeBounds,
} from "../profitLossLogic";
import { getAuthorizedViewer } from "./viewerAccess";

// 集計に必要な行をまとめて取得する（RLS により権限に応じた行のみ返る）
// セッション Cookie は @supabase/ssr 形式。createServerSupabase() 以外のクライアントを混ぜない
// period を渡すと対象期間＋月未確定（NULL）行に絞る。月次は単月、年間推移は年度12ヶ月を渡し、
// いずれも5テーブルの一括取得（Promise.all）のままクエリ往復を増やさない。
// 省略時は全件取得（後方互換。呼び出し側は原則として期間を渡す）。
const fetchReportSourceRows = async (period?: ReportPeriod) => {
  const supabase = createServerSupabase();
  const bounds = period ? reportRangeBounds(period) : null;

  let businessQuery = supabase
    .from("business")
    .select(
      "id, name, amount, invoice_date, matter_id, matters!inner(id, title, team, category)",
    );
  let costQuery = supabase
    .from("costs")
    .select(
      "id, name, price, item, period, matter_id, matters!inner(id, title, team, category)",
    );
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

  if (bounds) {
    businessQuery = businessQuery.or(
      datedOrUndatedFilter("invoice_date", bounds),
    );
    costQuery = costQuery.or(datedOrUndatedFilter("period", bounds));
    extraQuery = extraQuery.or(datedOrUndatedFilter("entry_date", bounds));
    // 定期費用は適用期間の重なりで絞る（支払サイクルの計上判定は集計側で行う）。
    // 適用期間が取得期間と重ならない行だけを除外する。
    recurringQuery = recurringQuery
      .lt("start_month", bounds.endExclusive)
      .or(recurringOverlapEndFilter(bounds));
    // 調整は対象月で絞る（target_month は NOT NULL）。
    // なお対象行が取得期間外にある調整は orphanedAdjustments のラベル解決が
    // 汎用表示（「売上（ID: X）」等）に落ちる場合がある（集計値は不変）。
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
  ] = await Promise.all([
    businessQuery,
    costQuery,
    recurringQuery,
    extraQuery,
    adjustmentQuery,
  ]);

  if (
    businessResult.error ||
    costResult.error ||
    recurringResult.error ||
    extraResult.error ||
    adjustmentResult.error
  ) {
    console.error(
      "損益レポートのデータ取得に失敗しました:",
      businessResult.error ??
        costResult.error ??
        recurringResult.error ??
        extraResult.error ??
        adjustmentResult.error,
    );
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

  return buildMonthlyReport({
    month,
    businessRows: rows.businessRows,
    costRows: rows.costRows,
    recurringCosts: rows.recurringCosts,
    extraEntries: rows.extraEntries,
    adjustments: rows.adjustments,
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
