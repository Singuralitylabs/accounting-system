"use server";

import {
  AnnualTrendType,
  MatterInfoWithUserNameType,
  PLReportType,
} from "../../types/types";
import { PL_ALLOWED_CLASSES } from "../permissions";
import { createServerSupabase } from "./clients";
import { getMemberOptions } from "./profiles";
import { fiscalYearMonths, isMonthKey, reportFlags } from "../profitLossLogic";
import { buildMonthReport } from "../profitLossClosing";
import {
  fetchDiffMoveContext,
  fetchReportSourceRows,
} from "./profitLossSource";
import { annotateDiffMoves } from "../profitLossDiff";
import { getAuthorizedViewer } from "./viewerAccess";

export const getProfitLossReport = async (
  month: string,
): Promise<PLReportType | null> => {
  // Invalid month keys are a fetch failure (caller prompts a refetch), not a silent empty view.
  if (!isMonthKey(month)) {
    console.error(`損益レポートの対象月の形式が不正です: ${month}`);
    return null;
  }
  // Fetch failure and permission denial are both null.
  const { profileInfo } = await getAuthorizedViewer(
    PL_ALLOWED_CLASSES,
    "損益レポート",
  );
  if (!profileInfo) {
    return null;
  }

  // Adjustment-target supplement runs in parallel with the display-title fetch (fewer round trips).
  const flags = reportFlags(profileInfo.class, profileInfo.is_teamleader);
  const rows = await fetchReportSourceRows(
    { startMonth: month, endMonth: month },
    {
      supplement: {
        month,
        includeAdjustmentDetails: flags.includeAdjustmentDetails,
        includeMonthlyDetails: true,
      },
    },
  );
  if (!rows) {
    return null;
  }

  // Closed months come from closing lines, unclosed from live aggregation.
  const report = buildMonthReport({
    month,
    ...rows,
    closing: rows.closings.get(month) ?? null,
    includeMonthlyDetails: true,
    ...flags,
  });

  // Attaches move info to added/removed diffs. If that fetch fails, whether the counterpart month is
  // closed is unknown (applying one side would skew both months' totals), so the diff list warns and blocks applying.
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

// fiscalYear = start year (2026 = 2026/7 - 2027/6).
export const getAnnualTrend = async (
  fiscalYear: number,
): Promise<AnnualTrendType | null> => {
  // Invalid fiscal years are a fetch failure, not a silent empty view.
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

  // One query for the whole fiscal year, bucketed by month. The annual table shows only monthly
  // totals, so display titles are not fetched.
  const months = fiscalYearMonths(fiscalYear);
  const rows = await fetchReportSourceRows(
    {
      startMonth: months[0],
      endMonth: months[months.length - 1],
    },
    { includeLabels: false },
  );
  if (!rows) {
    return null;
  }

  // Closed months come from closing lines, unclosed from live aggregation.
  const trendMonths = months.map((month) =>
    buildMonthReport({
      month,
      ...rows,
      closing: rows.closings.get(month) ?? null,
      // The annual trend does not display orphaned adjustments / post-closing changes (counts come from
      // getClosingDiffSummary), so skip 12 months of computation.
      includeMonthlyDetails: false,
      ...reportFlags(profileInfo.class, profileInfo.is_teamleader),
    }),
  );

  return { fiscalYear, months: trendMonths };
};

// Single matter for the P&L 「案件を表示」 detail modal.
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
  // A teamleader cannot read other teams' profiles (RLS), so the join above is null for their
  // matters; fall back to get_member_options (id/name of every member, SECURITY DEFINER).
  let userName = profiles?.name ?? null;
  if (!profiles) {
    const { memberOptions, error: memberError } = await getMemberOptions();
    if (memberError) {
      console.error("担当者名の取得に失敗しました:", memberError);
    }
    userName =
      memberOptions?.find((member) => member.id === matter.user_id)?.name ??
      null;
  }
  const matterInfo: MatterInfoWithUserNameType = {
    ...matter,
    user_name: userName,
    slack_id: profiles?.slack_id ?? null,
  };

  return { matterInfo, error: null };
};
