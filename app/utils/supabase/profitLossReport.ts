"use server";

import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "../../lib/database.types";
import {
  AnnualTrendType,
  CategoryBreakdown,
  ExtraEntryType,
  ItemBreakdown,
  MatterCostDetail,
  MatterInfoWithUserNameType,
  PLReportType,
  RecurringCostType,
  TeamBreakdown,
} from "../../types/types";
import { ORG_WIDE_TEAM_LABEL } from "../constants";
import { PL_ALLOWED_CLASSES, hasClassAccess } from "../permissions";
import { getProfileInfo } from "./supabaseServer";

// 集計対象の行（RLS により権限に応じた行のみ取得される）
type BusinessRow = {
  amount: number | null;
  invoice_date: string | null;
  matters: { team: string; category: string };
};

type CostRow = {
  price: number;
  item: string;
  period: string | null;
  matter_id: number;
  matters: { id: number; title: string; team: string };
};

// 日付文字列（YYYY-MM-DD）から月キー（YYYY-MM）を取り出す。
// タイムゾーン変換による月ズレを避けるため Date オブジェクトは使わない。
const toMonthKey = (dateStr: string | null): string | null =>
  dateStr ? dateStr.slice(0, 7) : null;

// 支払サイクルごとの間隔（月数）
const CYCLE_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

// 月キー（YYYY-MM）同士の月数差
const monthDiff = (fromMonth: string, toMonth: string): number => {
  const fromYear = parseInt(fromMonth.slice(0, 4), 10);
  const fromMonthNumber = parseInt(fromMonth.slice(5, 7), 10);
  const toYear = parseInt(toMonth.slice(0, 4), 10);
  const toMonthNumber = parseInt(toMonth.slice(5, 7), 10);
  return (toYear - fromYear) * 12 + (toMonthNumber - fromMonthNumber);
};

// 定期費用が指定月に計上されるか。
// 適用期間内（end_month の月を含む）かつ、支払月（start_month を起点に
// 支払サイクル間隔ごと）に一致する月にのみ全額を計上する。
const isRecurringCostChargedInMonth = (
  recurringCost: RecurringCostType,
  month: string
): boolean => {
  const start = recurringCost.start_month.slice(0, 7);
  const end = recurringCost.end_month
    ? recurringCost.end_month.slice(0, 7)
    : null;
  if (!(start <= month && (end === null || month <= end))) {
    return false;
  }
  const cycleMonths = CYCLE_MONTHS[recurringCost.payment_cycle] ?? 1;
  return monthDiff(start, month) % cycleMonths === 0;
};

// ロール（profiles.class）からレポートの挙動フラグを導出する。
// includeTeamBreakdown と canEditExtraEntries は現状どちらも accounting / admin だが、
// 「チーム別内訳の表示」と「経理追加収支の管理可否」は別概念のため、
// 片方だけ変更できるように独立して定義する。
// （経理追加収支の実際の書き込み権限は RLS が担保し、これは UI 表示の制御のみ）
const reportFlags = (profileClass: string | null | undefined) => ({
  isTeamLeader: profileClass === "teamleader",
  includeTeamBreakdown: hasClassAccess(["accounting", "admin"], profileClass),
  canEditExtraEntries: hasClassAccess(["accounting", "admin"], profileClass),
});

// buildMonthlyReport の入力。
// boolean フラグが複数あるため、呼び出し側での取り違えを防ぐ目的で
// 位置引数ではなくオブジェクトで受ける。
type MonthlyReportInput = {
  month: string;
  businessRows: BusinessRow[];
  costRows: CostRow[];
  recurringCosts: RecurringCostType[];
  extraEntries: ExtraEntryType[];
  isTeamLeader: boolean;
  includeTeamBreakdown: boolean; // チーム別内訳を含めるか（accounting / admin）
  canEditExtraEntries: boolean; // 経理追加収支の管理UIを表示するか（accounting / admin）
};

// 取得済みの行から指定月の損益レポートを組み立てる
const buildMonthlyReport = ({
  month,
  businessRows,
  costRows,
  recurringCosts,
  extraEntries,
  isTeamLeader,
  includeTeamBreakdown,
  canEditExtraEntries,
}: MonthlyReportInput): PLReportType => {
  // ===== 経理追加収支 =====
  // 計上月は entry_date の属する月（NULL は月未確定として別枠集計）
  const monthlyExtraEntries = extraEntries.filter(
    (entry) => toMonthKey(entry.entry_date) === month
  );

  // teamleader の場合、全体共通（team IS NULL）は損益に算入せず参考表示に分離する
  // （定期費用と同じルール）
  const countedExtraEntries = isTeamLeader
    ? monthlyExtraEntries.filter((entry) => entry.team !== null)
    : monthlyExtraEntries;
  const orgWideExtraEntries = isTeamLeader
    ? monthlyExtraEntries.filter((entry) => entry.team === null)
    : undefined;

  // 収入エントリの請求額 → 売上。経費（収入・支出共通）→ 案件費用
  const incomeEntries = countedExtraEntries.filter(
    (entry) => entry.entry_type === "income"
  );
  const extraExpenseEntries = countedExtraEntries.filter(
    (entry) => entry.expense_amount !== null
  );

  // ===== 売上（分類別。経理追加収支の収入を合算） =====
  const monthlyBusiness = businessRows.filter(
    (row) => toMonthKey(row.invoice_date) === month
  );
  const revenueTotal =
    monthlyBusiness.reduce((sum, row) => sum + (row.amount ?? 0), 0) +
    incomeEntries.reduce((sum, entry) => sum + (entry.billing_amount ?? 0), 0);

  const categoryMap = new Map<string, number>();
  monthlyBusiness.forEach((row) => {
    const category = row.matters.category;
    categoryMap.set(category, (categoryMap.get(category) ?? 0) + (row.amount ?? 0));
  });
  incomeEntries.forEach((entry) => {
    // 収入エントリの billing_amount は CHECK 制約で NOT NULL（型上は nullable）
    categoryMap.set(
      entry.category,
      (categoryMap.get(entry.category) ?? 0) + (entry.billing_amount ?? 0)
    );
  });
  const revenueByCategory: CategoryBreakdown[] = Array.from(
    categoryMap.entries()
  )
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  // ===== 案件費用（品目別 → 案件別明細。経理追加収支の経費を合算） =====
  const monthlyCosts = costRows.filter(
    (row) => toMonthKey(row.period) === month
  );
  const matterCostTotal =
    monthlyCosts.reduce((sum, row) => sum + row.price, 0) +
    extraExpenseEntries.reduce(
      (sum, entry) => sum + (entry.expense_amount ?? 0),
      0
    );

  const itemMap = new Map<string, Map<number, MatterCostDetail>>();
  monthlyCosts.forEach((row) => {
    if (!itemMap.has(row.item)) {
      itemMap.set(row.item, new Map());
    }
    const matterMap = itemMap.get(row.item)!;
    const existing = matterMap.get(row.matter_id);
    if (existing) {
      existing.amount += row.price;
    } else {
      matterMap.set(row.matter_id, {
        matterId: row.matter_id,
        matterTitle: row.matters.title,
        amount: row.price,
      });
    }
  });
  // 経理追加収支の経費を分類別にまとめる（費用内訳ではエントリの分類を品目相当として扱う）
  const extraCostByCategory = new Map<string, ExtraEntryType[]>();
  extraExpenseEntries.forEach((entry) => {
    if (!extraCostByCategory.has(entry.category)) {
      extraCostByCategory.set(entry.category, []);
    }
    extraCostByCategory.get(entry.category)!.push(entry);
  });
  const allCostItems = new Set([
    ...Array.from(itemMap.keys()),
    ...Array.from(extraCostByCategory.keys()),
  ]);
  const matterCostByItem: ItemBreakdown[] = Array.from(allCostItems)
    .map((item) => {
      const matters = Array.from(itemMap.get(item)?.values() ?? []).sort(
        (a, b) => b.amount - a.amount
      );
      const itemExtraEntries = extraCostByCategory.get(item) ?? [];
      return {
        item,
        amount:
          matters.reduce((sum, m) => sum + m.amount, 0) +
          itemExtraEntries.reduce(
            (sum, entry) => sum + (entry.expense_amount ?? 0),
            0
          ),
        matters,
        extraEntries: itemExtraEntries,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  // ===== 管理費（定期費用） =====
  const activeRecurringCosts = recurringCosts.filter((rc) =>
    isRecurringCostChargedInMonth(rc, month)
  );

  // teamleader の場合、全体共通（team IS NULL）は損益に算入せず参考表示に分離する
  const countedRecurringCosts = isTeamLeader
    ? activeRecurringCosts.filter((rc) => rc.team !== null)
    : activeRecurringCosts;
  const orgWideRecurringCosts = isTeamLeader
    ? activeRecurringCosts.filter((rc) => rc.team === null)
    : undefined;

  const recurringCostTotal = countedRecurringCosts.reduce(
    (sum, rc) => sum + rc.price,
    0
  );

  // ===== 月未確定（日付未入力） =====
  const undated = {
    revenue:
      businessRows
        .filter((row) => row.invoice_date === null)
        .reduce((sum, row) => sum + (row.amount ?? 0), 0) +
      extraEntries
        .filter(
          (entry) => entry.entry_date === null && entry.entry_type === "income"
        )
        .reduce((sum, entry) => sum + (entry.billing_amount ?? 0), 0),
    matterCost:
      costRows
        .filter((row) => row.period === null)
        .reduce((sum, row) => sum + row.price, 0) +
      extraEntries
        .filter((entry) => entry.entry_date === null)
        .reduce((sum, entry) => sum + (entry.expense_amount ?? 0), 0),
  };

  // ===== チーム別内訳（accounting / admin のみ） =====
  let byTeam: TeamBreakdown[] | undefined;
  if (includeTeamBreakdown) {
    const teamMap = new Map<string, TeamBreakdown>();
    const getTeamEntry = (team: string): TeamBreakdown => {
      if (!teamMap.has(team)) {
        teamMap.set(team, {
          team,
          revenue: 0,
          matterCost: 0,
          recurringCost: 0,
          profit: 0,
        });
      }
      return teamMap.get(team)!;
    };

    monthlyBusiness.forEach((row) => {
      getTeamEntry(row.matters.team).revenue += row.amount ?? 0;
    });
    monthlyCosts.forEach((row) => {
      getTeamEntry(row.matters.team).matterCost += row.price;
    });
    activeRecurringCosts.forEach((rc) => {
      getTeamEntry(rc.team ?? ORG_WIDE_TEAM_LABEL).recurringCost += rc.price;
    });
    // 経理追加収支は本表と同じく売上 / 案件費用へ算入する（チーム未指定は「全体共通」）
    monthlyExtraEntries.forEach((entry) => {
      const teamEntry = getTeamEntry(entry.team ?? ORG_WIDE_TEAM_LABEL);
      if (entry.entry_type === "income") {
        teamEntry.revenue += entry.billing_amount ?? 0;
      }
      teamEntry.matterCost += entry.expense_amount ?? 0;
    });

    byTeam = Array.from(teamMap.values())
      .map((entry) => ({
        ...entry,
        profit: entry.revenue - entry.matterCost - entry.recurringCost,
      }))
      .sort((a, b) => b.profit - a.profit);
  }

  return {
    month,
    revenueTotal,
    revenueByCategory,
    matterCostTotal,
    matterCostByItem,
    recurringCostTotal,
    recurringCostDetails: countedRecurringCosts,
    orgWideRecurringCosts,
    extraEntries: countedExtraEntries,
    orgWideExtraEntries,
    canEditExtraEntries,
    operatingProfit: revenueTotal - matterCostTotal - recurringCostTotal,
    byTeam,
    undated,
  };
};

// 集計に必要な行をまとめて取得する（RLS により権限に応じた行のみ返る）
// セッション Cookie は auth-helpers 形式のため、既存コードと同じクライアントを使う
// NOTE: business / costs は全件取得している。データが数年分蓄積して
// ペイロードが問題になったら、対象期間（invoice_date / period の範囲＋ NULL 行）で
// 絞り込む WHERE 句の追加を検討する。
const fetchReportSourceRows = async () => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const [businessResult, costResult, recurringResult, extraResult] =
    await Promise.all([
      supabase
        .from("business")
        .select("amount, invoice_date, matters!inner(team, category)"),
      supabase
        .from("costs")
        .select("price, item, period, matter_id, matters!inner(id, title, team)"),
      supabase.from("recurring_costs").select("*").order("id", { ascending: true }),
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
        extraResult.error
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
  month: string
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

// 年度（7月〜翌6月）の月キー一覧を生成する
const fiscalYearMonths = (fiscalYear: number): string[] =>
  Array.from({ length: 12 }, (_, i) => {
    const monthNumber = ((6 + i) % 12) + 1; // 7, 8, ..., 12, 1, ..., 6
    const year = monthNumber >= 7 ? fiscalYear : fiscalYear + 1;
    return `${year}-${String(monthNumber).padStart(2, "0")}`;
  });

// 年間推移の取得（fiscalYear: 年度の開始年。2026 = 2026/7〜2027/6）
export const getAnnualTrend = async (
  fiscalYear: number
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
    })
  );

  return { fiscalYear, months };
};

// 案件情報の単体取得（損益計算書の「案件を表示」ボタン → 案件詳細モーダル用）
export const getMatterInfoById = async (matterId: number) => {
  const supabase = createServerComponentClient<Database>({ cookies });

  const { data, error } = await supabase
    .from("matters")
    .select(
      `
      *,
      profiles!matters_user_id_fkey (
        name,
        slack_id
      )
    `
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
