// 損益計算書の集計ロジック（純粋関数）。
// Supabase アクセス（"use server" が付く app/utils/supabase/profitLossReport.ts）から
// 切り離しているのは、副作用なしでユニットテストできるようにするため
// （docs/testing.md「2.6 テスト容易化リファクタリング方針」）。

import {
  AdjustableAmount,
  AdjustmentTargetType,
  BusinessDetail,
  CategoryBreakdown,
  CostDetail,
  ExtraEntryType,
  GrossProfitBreakdown,
  ItemBreakdown,
  OrphanedAdjustmentType,
  PLReportType,
  ProfitLossAdjustmentType,
  RecurringCostDetail,
  RecurringCostItemBreakdown,
  RecurringCostType,
  TeamBreakdown,
} from "../types/types";
import { ORG_WIDE_TEAM_LABEL } from "./constants";
import { hasClassAccess } from "./permissions";

// 集計対象の行（RLS により権限に応じた行のみ取得される）
export type BusinessRow = {
  id: number;
  amount: number | null;
  invoice_date: string | null;
  matter_id: number;
  matters: { id: number; title: string; team: string; category: string };
};

export type CostRow = {
  id: number;
  price: number;
  item: string;
  period: string | null;
  matter_id: number;
  // category は案件費用を売上分類（大分類）別の粗利へ振り分けるために使う
  matters: { id: number; title: string; team: string; category: string };
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
export const monthDiff = (fromMonth: string, toMonth: string): number => {
  const fromYear = parseInt(fromMonth.slice(0, 4), 10);
  const fromMonthNumber = parseInt(fromMonth.slice(5, 7), 10);
  const toYear = parseInt(toMonth.slice(0, 4), 10);
  const toMonthNumber = parseInt(toMonth.slice(5, 7), 10);
  return (toYear - fromYear) * 12 + (toMonthNumber - fromMonthNumber);
};

// 定期費用が指定月に計上されるか。
// 適用期間内（end_month の月を含む）かつ、支払月（start_month を起点に
// 支払サイクル間隔ごと）に一致する月にのみ全額を計上する。
export const isRecurringCostChargedInMonth = (
  recurringCost: RecurringCostType,
  month: string,
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
export const reportFlags = (profileClass: string | null | undefined) => ({
  isTeamLeader: profileClass === "teamleader",
  includeTeamBreakdown: hasClassAccess(["accounting", "admin"], profileClass),
});

// buildMonthlyReport の入力。
// boolean フラグが複数あるため、呼び出し側での取り違えを防ぐ目的で
// 位置引数ではなくオブジェクトで受ける。
export type MonthlyReportInput = {
  month: string;
  businessRows: BusinessRow[];
  costRows: CostRow[];
  recurringCosts: RecurringCostType[];
  extraEntries: ExtraEntryType[];
  adjustments: ProfitLossAdjustmentType[];
  isTeamLeader: boolean;
  includeTeamBreakdown: boolean; // チーム別内訳を含めるか（accounting / admin）
};

// 対象月・対象行に対する調整（profit_loss_adjustments）を検索する。
// 呼び出し側の対象月フィルタと取り違えないよう、比較は必ずここで行う
const findAdjustment = (
  adjustments: ProfitLossAdjustmentType[],
  month: string,
  key: "business_id" | "cost_id" | "recurring_cost_id",
  id: number,
): ProfitLossAdjustmentType | undefined =>
  adjustments.find(
    (adjustment) =>
      adjustment[key] === id && toMonthKey(adjustment.target_month) === month,
  );

// 元データの金額と調整から「元データ / 調整 / 実績」の3値を組み立てる。
// 実績額は常に「現在の元データ金額 + 調整の差分」で計算する（調整保存後に元データが
// 変わっても、調整の差分自体は自動更新しない。sourceChanged で警告を出すのみ）
const toAdjustable = (
  sourceAmount: number,
  adjustment: ProfitLossAdjustmentType | undefined,
): AdjustableAmount => {
  const adjustmentAmount = adjustment?.adjustment_amount ?? 0;
  return {
    sourceAmount,
    adjustmentAmount,
    actualAmount: sourceAmount + adjustmentAmount,
    sourceChanged: adjustment
      ? adjustment.source_amount_snapshot !== sourceAmount
      : false,
    adjustment: adjustment ?? null,
  };
};

// 取得済みの行から指定月の損益レポートを組み立てる
export const buildMonthlyReport = ({
  month,
  businessRows,
  costRows,
  recurringCosts,
  extraEntries,
  adjustments,
  isTeamLeader,
  includeTeamBreakdown,
}: MonthlyReportInput): PLReportType => {
  // 実績額のみを必要とする箇所（チーム別内訳）向けの簡易ヘルパー
  const actualAmountOf = (
    key: "business_id" | "cost_id" | "recurring_cost_id",
    id: number,
    sourceAmount: number,
  ) =>
    toAdjustable(sourceAmount, findAdjustment(adjustments, month, key, id))
      .actualAmount;

  // ===== 経理追加収支 =====
  // 計上月は entry_date の属する月（NULL は月未確定として別枠集計）
  const monthlyExtraEntries = extraEntries.filter(
    (entry) => toMonthKey(entry.entry_date) === month,
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
    (entry) => entry.entry_type === "income",
  );
  const extraExpenseEntries = countedExtraEntries.filter(
    (entry) => entry.expense_amount !== null,
  );

  // ===== 売上（分類別。案件別（business 行別）の明細＋経理追加収支の収入を合算） =====
  const monthlyBusiness = businessRows.filter(
    (row) => toMonthKey(row.invoice_date) === month,
  );

  const categoryMap = new Map<
    string,
    { total: number; businesses: BusinessDetail[] }
  >();
  const getCategoryEntry = (category: string) => {
    if (!categoryMap.has(category)) {
      categoryMap.set(category, { total: 0, businesses: [] });
    }
    return categoryMap.get(category)!;
  };

  monthlyBusiness.forEach((row) => {
    const adjustment = findAdjustment(
      adjustments,
      month,
      "business_id",
      row.id,
    );
    const adjustable = toAdjustable(row.amount ?? 0, adjustment);
    const detail: BusinessDetail = {
      ...adjustable,
      businessId: row.id,
      matterId: row.matter_id,
      matterTitle: row.matters.title,
    };
    const entry = getCategoryEntry(row.matters.category);
    entry.total += adjustable.actualAmount;
    entry.businesses.push(detail);
  });
  incomeEntries.forEach((entry) => {
    // 収入エントリの billing_amount は CHECK 制約で NOT NULL（型上は nullable）
    getCategoryEntry(entry.category).total += entry.billing_amount ?? 0;
  });

  const revenueByCategory: CategoryBreakdown[] = Array.from(
    categoryMap.entries(),
  )
    .map(([category, { total, businesses }]) => ({
      category,
      amount: total,
      businesses: businesses.sort((a, b) => b.actualAmount - a.actualAmount),
    }))
    .sort((a, b) => b.amount - a.amount);

  const revenueTotal = revenueByCategory.reduce((sum, c) => sum + c.amount, 0);

  // ===== 案件費用（品目別 → 案件費用明細。経理追加収支の経費を合算） =====
  const monthlyCosts = costRows.filter(
    (row) => toMonthKey(row.period) === month,
  );

  const itemMap = new Map<string, CostDetail[]>();
  const categoryCostMap = new Map<string, number>();
  monthlyCosts.forEach((row) => {
    const adjustment = findAdjustment(adjustments, month, "cost_id", row.id);
    const adjustable = toAdjustable(row.price, adjustment);
    const detail: CostDetail = {
      ...adjustable,
      costId: row.id,
      matterId: row.matter_id,
      matterTitle: row.matters.title,
    };
    if (!itemMap.has(row.item)) {
      itemMap.set(row.item, []);
    }
    itemMap.get(row.item)!.push(detail);
    categoryCostMap.set(
      row.matters.category,
      (categoryCostMap.get(row.matters.category) ?? 0) +
        adjustable.actualAmount,
    );
  });
  // 経理追加収支の経費を分類別にまとめる（費用内訳ではエントリの分類を品目相当として扱う）
  const extraCostByCategory = new Map<string, ExtraEntryType[]>();
  extraExpenseEntries.forEach((entry) => {
    if (!extraCostByCategory.has(entry.category)) {
      extraCostByCategory.set(entry.category, []);
    }
    extraCostByCategory.get(entry.category)!.push(entry);
    categoryCostMap.set(
      entry.category,
      (categoryCostMap.get(entry.category) ?? 0) + (entry.expense_amount ?? 0),
    );
  });
  const allCostItems = new Set([
    ...Array.from(itemMap.keys()),
    ...Array.from(extraCostByCategory.keys()),
  ]);
  const matterCostByItem: ItemBreakdown[] = Array.from(allCostItems)
    .map((item) => {
      const costs = (itemMap.get(item) ?? []).sort(
        (a, b) => b.actualAmount - a.actualAmount,
      );
      const itemExtraEntries = extraCostByCategory.get(item) ?? [];
      return {
        item,
        amount:
          costs.reduce((sum, c) => sum + c.actualAmount, 0) +
          itemExtraEntries.reduce(
            (sum, entry) => sum + (entry.expense_amount ?? 0),
            0,
          ),
        costs,
        extraEntries: itemExtraEntries,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const matterCostTotal = matterCostByItem.reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  // ===== 売上総利益（粗利）= 売上 − 案件費用（売上分類の大分類別） =====
  // 案件費用は案件の分類（matters.category）へ、経理追加収支の経費はエントリの分類へ
  // 振り分ける。売上・案件費用のいずれもちょうど1つの分類に属するため、
  // 粗利合計は「売上合計 − 案件費用合計」と必ず一致する。
  // 分類の値はマスタ（select_options）に追従するため、特定の分類名には依存しない。
  const grossProfitByCategory: GrossProfitBreakdown[] = Array.from(
    new Set([
      ...Array.from(categoryMap.keys()),
      ...Array.from(categoryCostMap.keys()),
    ]),
  )
    .map((category) => {
      const revenue = categoryMap.get(category)?.total ?? 0;
      const cost = categoryCostMap.get(category) ?? 0;
      return { category, revenue, cost, grossProfit: revenue - cost };
    })
    .sort((a, b) => b.grossProfit - a.grossProfit);

  const grossProfitTotal = revenueTotal - matterCostTotal;

  // ===== 管理費（定期費用） =====
  const activeRecurringCosts = recurringCosts.filter((rc) =>
    isRecurringCostChargedInMonth(rc, month),
  );

  const toRecurringCostDetail = (
    rc: RecurringCostType,
  ): RecurringCostDetail => {
    const adjustment = findAdjustment(
      adjustments,
      month,
      "recurring_cost_id",
      rc.id,
    );
    return { ...toAdjustable(rc.price, adjustment), recurringCost: rc };
  };

  // teamleader の場合、全体共通（team IS NULL）は損益に算入せず参考表示に分離する
  const countedRecurringCosts = isTeamLeader
    ? activeRecurringCosts.filter((rc) => rc.team !== null)
    : activeRecurringCosts;
  const orgWideRecurringCosts = isTeamLeader
    ? activeRecurringCosts
        .filter((rc) => rc.team === null)
        .map(toRecurringCostDetail)
    : undefined;

  // 費目（recurring_costs.item）別の管理費内訳。明細は展開表示に使う。
  const recurringItemMap = new Map<string, RecurringCostDetail[]>();
  countedRecurringCosts.forEach((rc) => {
    if (!recurringItemMap.has(rc.item)) {
      recurringItemMap.set(rc.item, []);
    }
    recurringItemMap.get(rc.item)!.push(toRecurringCostDetail(rc));
  });
  const recurringCostByItem: RecurringCostItemBreakdown[] = Array.from(
    recurringItemMap.entries(),
  )
    .map(([item, details]) => ({
      item,
      amount: details.reduce((sum, detail) => sum + detail.actualAmount, 0),
      details,
    }))
    .sort((a, b) => b.amount - a.amount);

  const recurringCostTotal = recurringCostByItem.reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  // ===== 月未確定（日付未入力） =====
  const undated = {
    revenue:
      businessRows
        .filter((row) => row.invoice_date === null)
        .reduce((sum, row) => sum + (row.amount ?? 0), 0) +
      extraEntries
        .filter(
          (entry) => entry.entry_date === null && entry.entry_type === "income",
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
          grossProfit: 0,
          recurringCost: 0,
          profit: 0,
        });
      }
      return teamMap.get(team)!;
    };

    monthlyBusiness.forEach((row) => {
      getTeamEntry(row.matters.team).revenue += actualAmountOf(
        "business_id",
        row.id,
        row.amount ?? 0,
      );
    });
    monthlyCosts.forEach((row) => {
      getTeamEntry(row.matters.team).matterCost += actualAmountOf(
        "cost_id",
        row.id,
        row.price,
      );
    });
    activeRecurringCosts.forEach((rc) => {
      getTeamEntry(rc.team ?? ORG_WIDE_TEAM_LABEL).recurringCost +=
        actualAmountOf("recurring_cost_id", rc.id, rc.price);
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
        grossProfit: entry.revenue - entry.matterCost,
        profit: entry.revenue - entry.matterCost - entry.recurringCost,
      }))
      .sort((a, b) => b.profit - a.profit);
  }

  // ===== 対象行が当月に存在しない調整（案件の日付変更等で対象行が別の月に移動した） =====
  // CASCADE により対象行そのものが削除された調整は存在しなくなるため、ここに現れるのは
  // 「対象行は存在するが、当月の集計対象からは外れた」ケースのみ。削除を促す表示に使うため、
  // 実績額修正の操作を持つロール（includeTeamBreakdown = accounting / admin）にのみ含める
  let orphanedAdjustments: OrphanedAdjustmentType[] | undefined;
  if (includeTeamBreakdown) {
    const monthlyBusinessIds = new Set(monthlyBusiness.map((row) => row.id));
    const monthlyCostIds = new Set(monthlyCosts.map((row) => row.id));
    const activeRecurringCostIds = new Set(
      activeRecurringCosts.map((rc) => rc.id),
    );

    orphanedAdjustments = adjustments
      .filter((adjustment) => toMonthKey(adjustment.target_month) === month)
      .filter((adjustment) => {
        if (adjustment.business_id !== null) {
          return !monthlyBusinessIds.has(adjustment.business_id);
        }
        if (adjustment.cost_id !== null) {
          return !monthlyCostIds.has(adjustment.cost_id);
        }
        return !activeRecurringCostIds.has(adjustment.recurring_cost_id!);
      })
      .map((adjustment) => {
        const targetType: AdjustmentTargetType =
          adjustment.business_id !== null
            ? "business"
            : adjustment.cost_id !== null
              ? "cost"
              : "recurring_cost";
        return { adjustment, targetType };
      });
  }

  return {
    month,
    revenueTotal,
    revenueByCategory,
    matterCostTotal,
    matterCostByItem,
    grossProfitTotal,
    grossProfitByCategory,
    recurringCostTotal,
    recurringCostByItem,
    orgWideRecurringCosts,
    extraEntries: countedExtraEntries,
    orgWideExtraEntries,
    ordinaryProfit: grossProfitTotal - recurringCostTotal,
    byTeam,
    undated,
    orphanedAdjustments,
  };
};

// 年度（7月〜翌6月）の月キー一覧を生成する
export const fiscalYearMonths = (fiscalYear: number): string[] =>
  Array.from({ length: 12 }, (_, i) => {
    const monthNumber = ((6 + i) % 12) + 1; // 7, 8, ..., 12, 1, ..., 6
    const year = monthNumber >= 7 ? fiscalYear : fiscalYear + 1;
    return `${year}-${String(monthNumber).padStart(2, "0")}`;
  });
