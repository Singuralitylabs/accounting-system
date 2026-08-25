"use server";

import {
  AnnualTrendType,
  MatterInfoWithUserNameType,
  PLReportType,
} from "../../types/types";
import { PL_ALLOWED_CLASSES, hasClassAccess } from "../permissions";
import { createServerSupabase } from "./clients";
import {
  BusinessRow,
  CostRow,
  buildMonthlyReport,
  fiscalYearMonths,
  reportFlags,
} from "../profitLossLogic";
import { getProfileInfo } from "./supabaseServer";

// 集計に必要な行をまとめて取得する（RLS により権限に応じた行のみ返る）
// セッション Cookie は auth-helpers 形式のため、既存コードと同じクライアントを使う
// NOTE: business / costs は全件取得している。データが数年分蓄積して
// ペイロードが問題になったら、対象期間（invoice_date / period の範囲＋ NULL 行）で
// 絞り込む WHERE 句の追加を検討する。
const fetchReportSourceRows = async () => {
  const supabase = createServerSupabase();

  const [businessResult, costResult, recurringResult, extraResult] =
    await Promise.all([
      supabase
        .from("business")
        .select("amount, invoice_date, matters!inner(team, category)"),
      supabase
        .from("costs")
        .select(
          "price, item, period, matter_id, matters!inner(id, title, team, category)",
        ),
      supabase
        .from("recurring_costs")
        .select("*")
        .order("id", { ascending: true }),
      supabase.from("extra_entries").select("*").order("id", { ascending: true }),
    ]);

  if (
    businessResult.error ||
    costResult.error ||
    recurringResult.error ||
    extraResult.error
  ) {
    console.error(
      "損益レポートのデータ取得に失敗しました:",
      businessResult.error ??
        costResult.error ??
        recurringResult.error ??
        extraResult.error,
    );
    return null;
  }

  return {
    businessRows: (businessResult.data ?? []) as BusinessRow[],
    costRows: (costResult.data ?? []) as CostRow[],
    recurringCosts: recurringResult.data ?? [],
    extraEntries: extraResult.data ?? [],
  };
};

// 月次損益レポートの取得（month: "YYYY-MM"）
export const getProfitLossReport = async (
  month: string,
): Promise<PLReportType | null> => {
  const { profileInfo, error } = await getProfileInfo();
  if (error || !profileInfo) {
    console.error("profiles情報の取得処理で失敗しました。", error);
    return null;
  }

  // middleware はページ遷移しか守らないため、Server Action 側でも権限を確認する（多層防御）
  if (!hasClassAccess(PL_ALLOWED_CLASSES, profileInfo.class)) {
    console.error("損益レポートの閲覧権限がありません。");
    return null;
  }

  const rows = await fetchReportSourceRows();
  if (!rows) {
    return null;
  }

  return buildMonthlyReport({
    month,
    businessRows: rows.businessRows,
    costRows: rows.costRows,
    recurringCosts: rows.recurringCosts,
    extraEntries: rows.extraEntries,
    ...reportFlags(profileInfo.class),
  });
};

// 年間推移の取得（fiscalYear: 年度の開始年。2026 = 2026/7〜2027/6）
export const getAnnualTrend = async (
  fiscalYear: number,
): Promise<AnnualTrendType | null> => {
  const { profileInfo, error } = await getProfileInfo();
  if (error || !profileInfo) {
    console.error("profiles情報の取得処理で失敗しました。", error);
    return null;
  }

  if (!hasClassAccess(PL_ALLOWED_CLASSES, profileInfo.class)) {
    console.error("損益レポートの閲覧権限がありません。");
    return null;
  }

  // 年度の全期間を 1 回のクエリで取得し、月別にバケット分けする
  const rows = await fetchReportSourceRows();
  if (!rows) {
    return null;
  }

  const months = fiscalYearMonths(fiscalYear).map((month) =>
    buildMonthlyReport({
      month,
      businessRows: rows.businessRows,
      costRows: rows.costRows,
      recurringCosts: rows.recurringCosts,
      extraEntries: rows.extraEntries,
      ...reportFlags(profileInfo.class),
    }),
  );

  return { fiscalYear, months };
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
