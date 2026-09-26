"use server";

import {
  AnnualTrendType,
  MatterInfoWithUserNameType,
  PLReportType,
} from "../../types/types";
import { PL_ALLOWED_CLASSES } from "../permissions";
import { createServerSupabase } from "./clients";
import { fiscalYearMonths, isMonthKey, reportFlags } from "../profitLossLogic";
import { buildMonthReport } from "../profitLossClosing";
import {
  fetchDiffMoveContext,
  fetchReportSourceRows,
  supplementAdjustmentTargets,
} from "./profitLossSource";
import { annotateDiffMoves } from "../profitLossDiff";
import { getAuthorizedViewer } from "./viewerAccess";

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
  const flags = reportFlags(profileInfo.class);
  await supplementAdjustmentTargets(month, rows, {
    includeTeamBreakdown: flags.includeTeamBreakdown,
  });

  // 確定済みの月は確定明細から、未確定の月はライブ集計から組み立てる（Issue #148）
  const report = buildMonthReport({
    month,
    ...rows,
    closing: rows.closings.get(month) ?? null,
    includeMonthlyDetails: true,
    ...flags,
  });

  // 確定後の差分（Issue #149）の追加・削除に、他の月との移動の情報を付ける。
  // 取得に失敗した場合は、相手側の月も確定済みかどうか（片方だけ反映すると両月の合計が
  // ずれる警告）が分からないため、差分一覧で注意を出して反映を止める
  if (report.closingDiffs) {
    const { context, failed } = await fetchDiffMoveContext(month, [
      ...report.closingDiffs.pending,
      ...report.closingDiffs.dismissed,
    ]);
    if (failed) {
      report.closingDiffs = {
        ...report.closingDiffs,
        moveInfoUnavailable: true,
      };
    } else if (context) {
      report.closingDiffs = annotateDiffMoves(report.closingDiffs, context);
    }
  }
  return report;
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

  // 確定済みの月は確定明細から、未確定の月はライブ集計から組み立てる（Issue #148）
  const trendMonths = months.map((month) =>
    buildMonthReport({
      month,
      ...rows,
      closing: rows.closings.get(month) ?? null,
      // 年間推移は対象行なし調整・確定後の変更を表示に使わないため 12ヶ月分の
      // 無駄な計算を避ける（AnnualTrendTable は参照しない。差分の件数はバナー用の
      // getClosingDiffSummary から取る）
      includeMonthlyDetails: false,
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
