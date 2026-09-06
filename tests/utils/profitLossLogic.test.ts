import { beforeEach, describe, expect, it } from "vitest";
import {
  BusinessRow,
  CostRow,
  MonthlyReportInput,
  buildMonthlyReport,
  fiscalYearMonths,
  isRecurringCostChargedInMonth,
  monthDiff,
  reportFlags,
} from "@/app/utils/profitLossLogic";
import {
  ExtraEntryType,
  ProfitLossAdjustmentType,
  RecurringCostType,
} from "@/app/types/types";

// ===== フィクスチャ生成ヘルパー =====

// business / costs の id は自動採番する（テストでは値そのものに意味は無く、
// 一意であることのみが必要）。テスト間で実行順に依存しないよう各テスト前にリセットする
let nextBusinessId = 1;
let nextCostId = 1;

beforeEach(() => {
  nextBusinessId = 1;
  nextCostId = 1;
});

const business = (
  amount: number | null,
  invoiceDate: string | null,
  category: string,
  team = "チームA",
  matterId = 1,
): BusinessRow => ({
  id: nextBusinessId++,
  amount,
  invoice_date: invoiceDate,
  matter_id: matterId,
  matters: { id: matterId, title: `案件${matterId}`, team, category },
});

const cost = (
  price: number,
  period: string | null,
  item: string,
  category: string,
  matterId = 1,
  team = "チームA",
): CostRow => ({
  id: nextCostId++,
  price,
  item,
  period,
  matter_id: matterId,
  matters: { id: matterId, title: `案件${matterId}`, team, category },
});

const adjustment = (
  override: Partial<ProfitLossAdjustmentType> &
    Pick<ProfitLossAdjustmentType, "id">,
): ProfitLossAdjustmentType => ({
  target_month: "2026-07-01",
  business_id: null,
  cost_id: null,
  recurring_cost_id: null,
  adjustment_amount: 1000,
  source_amount_snapshot: 0,
  reason: `調整理由${override.id}`,
  adjusted_by: 1,
  inserted_at: "2026-07-01T00:00:00+09:00",
  updated_at: "2026-07-01T00:00:00+09:00",
  ...override,
});

const recurringCost = (
  override: Partial<RecurringCostType> & Pick<RecurringCostType, "id">,
): RecurringCostType => ({
  name: `定期費用${override.id}`,
  item: "システム料",
  price: 10000,
  team: "チームA",
  payment_cycle: "monthly",
  start_month: "2026-07-01",
  end_month: null,
  comment: null,
  inserted_at: "2026-07-01T00:00:00+09:00",
  updated_at: "2026-07-01T00:00:00+09:00",
  ...override,
});

const extraEntry = (
  override: Partial<ExtraEntryType> & Pick<ExtraEntryType, "id">,
): ExtraEntryType => ({
  entry_type: "income",
  category: "協賛金",
  entry_date: "2026-07-10",
  invoice_number: null,
  description: `経理追加${override.id}`,
  billing_target: null,
  manager_id: 1,
  team: "チームA",
  billing_amount: null,
  expense_amount: null,
  payment_method: null,
  inserted_at: "2026-07-01T00:00:00+09:00",
  updated_at: "2026-07-01T00:00:00+09:00",
  ...override,
});

const buildInput = (
  override: Partial<MonthlyReportInput> = {},
): MonthlyReportInput => ({
  month: "2026-07",
  businessRows: [],
  costRows: [],
  recurringCosts: [],
  extraEntries: [],
  adjustments: [],
  isTeamLeader: false,
  includeTeamBreakdown: false,
  ...override,
});

// ===== 刷新前（営業損益）の実装 =====
// 要件4「経常利益は現行の営業損益と一致すること」を刷新前後の比較で担保するため、
// 粗利・経常利益の導入前に profitLossReport.ts が行っていた計算を、
// 本番実装から独立した形でここに固定しておく（本番実装の変更で自動追随しない）。
const LEGACY_CYCLE_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

const legacyOperatingProfit = ({
  month,
  businessRows,
  costRows,
  recurringCosts,
  extraEntries,
  isTeamLeader,
}: MonthlyReportInput): number => {
  const toMonthKey = (dateStr: string | null) =>
    dateStr ? dateStr.slice(0, 7) : null;

  const monthlyExtraEntries = extraEntries.filter(
    (entry) => toMonthKey(entry.entry_date) === month,
  );
  const countedExtraEntries = isTeamLeader
    ? monthlyExtraEntries.filter((entry) => entry.team !== null)
    : monthlyExtraEntries;

  const revenueTotal =
    businessRows
      .filter((row) => toMonthKey(row.invoice_date) === month)
      .reduce((sum, row) => sum + (row.amount ?? 0), 0) +
    countedExtraEntries
      .filter((entry) => entry.entry_type === "income")
      .reduce((sum, entry) => sum + (entry.billing_amount ?? 0), 0);

  const matterCostTotal =
    costRows
      .filter((row) => toMonthKey(row.period) === month)
      .reduce((sum, row) => sum + row.price, 0) +
    countedExtraEntries.reduce(
      (sum, entry) => sum + (entry.expense_amount ?? 0),
      0,
    );

  const recurringCostTotal = recurringCosts
    .filter((rc) => {
      const start = rc.start_month.slice(0, 7);
      const end = rc.end_month ? rc.end_month.slice(0, 7) : null;
      if (!(start <= month && (end === null || month <= end))) {
        return false;
      }
      const startYear = parseInt(start.slice(0, 4), 10);
      const startMonthNumber = parseInt(start.slice(5, 7), 10);
      const targetYear = parseInt(month.slice(0, 4), 10);
      const targetMonthNumber = parseInt(month.slice(5, 7), 10);
      const diff =
        (targetYear - startYear) * 12 + (targetMonthNumber - startMonthNumber);
      return diff % (LEGACY_CYCLE_MONTHS[rc.payment_cycle] ?? 1) === 0;
    })
    .filter((rc) => (isTeamLeader ? rc.team !== null : true))
    .reduce((sum, rc) => sum + rc.price, 0);

  return revenueTotal - matterCostTotal - recurringCostTotal;
};

describe("monthDiff", () => {
  it("同一年内の月数差を返す", () => {
    expect(monthDiff("2026-07", "2026-10")).toBe(3);
  });

  it("年をまたぐ月数差を返す", () => {
    expect(monthDiff("2026-07", "2027-06")).toBe(11);
  });

  it("過去方向の差はマイナスになる", () => {
    expect(monthDiff("2026-07", "2026-04")).toBe(-3);
  });
});

describe("isRecurringCostChargedInMonth", () => {
  it("月払いは適用期間内の毎月計上される", () => {
    const rc = recurringCost({ id: 1, payment_cycle: "monthly" });
    expect(isRecurringCostChargedInMonth(rc, "2026-07")).toBe(true);
    expect(isRecurringCostChargedInMonth(rc, "2026-08")).toBe(true);
    expect(isRecurringCostChargedInMonth(rc, "2027-06")).toBe(true);
  });

  it("四半期払いは適用開始月を起点に3ヶ月ごとに計上される", () => {
    const rc = recurringCost({ id: 1, payment_cycle: "quarterly" });
    expect(isRecurringCostChargedInMonth(rc, "2026-07")).toBe(true);
    expect(isRecurringCostChargedInMonth(rc, "2026-08")).toBe(false);
    expect(isRecurringCostChargedInMonth(rc, "2026-10")).toBe(true);
    expect(isRecurringCostChargedInMonth(rc, "2027-01")).toBe(true);
  });

  it("年払いは適用開始月と同じ月にのみ計上される", () => {
    const rc = recurringCost({ id: 1, payment_cycle: "yearly" });
    expect(isRecurringCostChargedInMonth(rc, "2026-07")).toBe(true);
    expect(isRecurringCostChargedInMonth(rc, "2027-06")).toBe(false);
    expect(isRecurringCostChargedInMonth(rc, "2027-07")).toBe(true);
  });

  it("適用開始前の月は計上されない", () => {
    const rc = recurringCost({ id: 1 });
    expect(isRecurringCostChargedInMonth(rc, "2026-06")).toBe(false);
  });

  it("適用終了月は含み、その翌月は計上されない", () => {
    const rc = recurringCost({ id: 1, end_month: "2026-09-01" });
    expect(isRecurringCostChargedInMonth(rc, "2026-09")).toBe(true);
    expect(isRecurringCostChargedInMonth(rc, "2026-10")).toBe(false);
  });

  it("適用終了月が未設定の場合は継続して計上される", () => {
    const rc = recurringCost({ id: 1, end_month: null });
    expect(isRecurringCostChargedInMonth(rc, "2030-01")).toBe(true);
  });
});

describe("fiscalYearMonths", () => {
  it("7月始まりの12ヶ月分を返す", () => {
    const months = fiscalYearMonths(2026);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-07");
    expect(months[5]).toBe("2026-12");
    expect(months[6]).toBe("2027-01");
    expect(months[11]).toBe("2027-06");
  });
});

describe("reportFlags", () => {
  it("teamleader はチーム別内訳を持たない", () => {
    expect(reportFlags("teamleader")).toEqual({
      isTeamLeader: true,
      includeTeamBreakdown: false,
    });
  });

  it("accounting / admin はチーム別内訳を持つ", () => {
    expect(reportFlags("accounting")).toEqual({
      isTeamLeader: false,
      includeTeamBreakdown: true,
    });
    expect(reportFlags("admin").includeTeamBreakdown).toBe(true);
  });

  it("public / 未設定ロールはすべてのフラグが false になる", () => {
    const expected = {
      isTeamLeader: false,
      includeTeamBreakdown: false,
    };
    expect(reportFlags("public")).toEqual(expected);
    expect(reportFlags(null)).toEqual(expected);
    expect(reportFlags(undefined)).toEqual(expected);
    expect(reportFlags("")).toEqual(expected);
  });
});

describe("buildMonthlyReport: 売上総利益（粗利）の分類別集計", () => {
  it("案件費用を案件の分類へ振り分け、分類別に 売上 − 案件費用 を集計する", () => {
    const report = buildMonthlyReport(
      buildInput({
        businessRows: [
          business(500000, "2026-07-31", "受託案件"),
          business(200000, "2026-07-15", "会員費"),
        ],
        costRows: [
          cost(300000, "2026-07-31", "外注費", "受託案件"),
          cost(50000, "2026-07-20", "システム料", "会員費", 2),
        ],
      }),
    );

    expect(report.grossProfitByCategory).toEqual([
      {
        category: "受託案件",
        revenue: 500000,
        cost: 300000,
        grossProfit: 200000,
      },
      {
        category: "会員費",
        revenue: 200000,
        cost: 50000,
        grossProfit: 150000,
      },
    ]);
  });

  it("粗利の降順で並ぶ", () => {
    const report = buildMonthlyReport(
      buildInput({
        businessRows: [
          business(100000, "2026-07-01", "会員費"),
          business(900000, "2026-07-01", "受託案件"),
          business(300000, "2026-07-01", "イベント"),
        ],
      }),
    );

    expect(report.grossProfitByCategory.map((row) => row.category)).toEqual([
      "受託案件",
      "イベント",
      "会員費",
    ]);
  });

  it("売上のない分類の費用は粗利がマイナスの行として現れる", () => {
    const report = buildMonthlyReport(
      buildInput({
        businessRows: [business(100000, "2026-07-01", "会員費")],
        costRows: [cost(80000, "2026-07-01", "外注費", "受託案件")],
      }),
    );

    expect(report.grossProfitByCategory).toContainEqual({
      category: "受託案件",
      revenue: 0,
      cost: 80000,
      grossProfit: -80000,
    });
  });

  it("経理追加収支の請求額・経費をエントリの分類の粗利へ算入する", () => {
    const report = buildMonthlyReport(
      buildInput({
        extraEntries: [
          extraEntry({
            id: 1,
            entry_type: "income",
            category: "受託収入",
            billing_amount: 400000,
            expense_amount: 100000,
          }),
          extraEntry({
            id: 2,
            entry_type: "expense",
            category: "消耗品費",
            billing_amount: null,
            expense_amount: 30000,
            payment_method: "銀行振込",
          }),
        ],
      }),
    );

    expect(report.grossProfitByCategory).toContainEqual({
      category: "受託収入",
      revenue: 400000,
      cost: 100000,
      grossProfit: 300000,
    });
    expect(report.grossProfitByCategory).toContainEqual({
      category: "消耗品費",
      revenue: 0,
      cost: 30000,
      grossProfit: -30000,
    });
  });

  it("分類別粗利の合計は 売上合計 − 案件費用合計 と一致する", () => {
    const report = buildMonthlyReport(
      buildInput({
        businessRows: [
          business(500000, "2026-07-31", "受託案件"),
          business(200000, "2026-07-15", "会員費"),
          business(999999, "2026-08-01", "会員費"), // 対象外の月
        ],
        costRows: [
          cost(300000, "2026-07-31", "外注費", "受託案件"),
          cost(50000, "2026-07-20", "システム料", "会員費", 2),
        ],
        extraEntries: [
          extraEntry({
            id: 1,
            entry_type: "income",
            category: "協賛金",
            billing_amount: 120000,
            expense_amount: 20000,
          }),
        ],
      }),
    );

    const sum = report.grossProfitByCategory.reduce(
      (total, row) => total + row.grossProfit,
      0,
    );
    expect(sum).toBe(report.grossProfitTotal);
    expect(report.grossProfitTotal).toBe(
      report.revenueTotal - report.matterCostTotal,
    );
  });

  it("対象月以外の売上・費用は粗利に含めない", () => {
    const report = buildMonthlyReport(
      buildInput({
        businessRows: [business(500000, "2026-08-01", "受託案件")],
        costRows: [cost(300000, "2026-06-30", "外注費", "受託案件")],
      }),
    );

    expect(report.grossProfitByCategory).toEqual([]);
    expect(report.grossProfitTotal).toBe(0);
  });
});

describe("buildMonthlyReport: 管理費の費目別集計", () => {
  it("同一費目の定期費用をまとめ、明細を保持する", () => {
    const report = buildMonthlyReport(
      buildInput({
        recurringCosts: [
          recurringCost({ id: 1, item: "システム料", price: 10000 }),
          recurringCost({ id: 2, item: "システム料", price: 5000 }),
          recurringCost({ id: 3, item: "広告宣伝費", price: 30000 }),
        ],
      }),
    );

    expect(report.recurringCostByItem).toHaveLength(2);
    expect(report.recurringCostByItem[0]).toMatchObject({
      item: "広告宣伝費",
      amount: 30000,
    });
    expect(report.recurringCostByItem[1]).toMatchObject({
      item: "システム料",
      amount: 15000,
    });
    expect(
      report.recurringCostByItem[1].details.map(
        (detail) => detail.recurringCost.id,
      ),
    ).toEqual([1, 2]);
  });

  it("費目別内訳の合計は管理費合計と一致する", () => {
    const report = buildMonthlyReport(
      buildInput({
        recurringCosts: [
          recurringCost({ id: 1, item: "システム料", price: 10000 }),
          recurringCost({
            id: 2,
            item: "広告宣伝費",
            price: 120000,
            payment_cycle: "yearly",
          }),
          recurringCost({
            id: 3,
            item: "施設利用料",
            price: 80000,
            start_month: "2026-08-01", // 対象月より後のため計上されない
          }),
        ],
      }),
    );

    const sum = report.recurringCostByItem.reduce(
      (total, row) => total + row.amount,
      0,
    );
    expect(sum).toBe(report.recurringCostTotal);
    expect(report.recurringCostTotal).toBe(130000);
    expect(report.recurringCostByItem.map((row) => row.item)).not.toContain(
      "施設利用料",
    );
  });

  it("teamleader では全体共通の管理費が費目別内訳に含まれない", () => {
    const report = buildMonthlyReport(
      buildInput({
        isTeamLeader: true,
        recurringCosts: [
          recurringCost({ id: 1, item: "システム料", team: "チームA" }),
          recurringCost({
            id: 2,
            item: "施設利用料",
            team: null,
            price: 50000,
          }),
        ],
      }),
    );

    expect(report.recurringCostByItem.map((row) => row.item)).toEqual([
      "システム料",
    ]);
    expect(report.recurringCostTotal).toBe(10000);
    expect(
      report.orgWideRecurringCosts?.map((detail) => detail.recurringCost.id),
    ).toEqual([2]);
  });
});

describe("buildMonthlyReport: 経常利益", () => {
  it("経常利益 = 粗利合計 − 管理費合計", () => {
    const report = buildMonthlyReport(
      buildInput({
        businessRows: [business(1000000, "2026-07-31", "受託案件")],
        costRows: [cost(400000, "2026-07-31", "外注費", "受託案件")],
        recurringCosts: [recurringCost({ id: 1, price: 150000 })],
      }),
    );

    expect(report.grossProfitTotal).toBe(600000);
    expect(report.recurringCostTotal).toBe(150000);
    expect(report.ordinaryProfit).toBe(450000);
    expect(report.ordinaryProfit).toBe(
      report.grossProfitTotal - report.recurringCostTotal,
    );
  });
});

// 要件4の回帰テスト（表示構造の変更で最終損益の値を変えない）
describe("buildMonthlyReport: 経常利益が刷新前の営業損益と一致する", () => {
  const cases: { name: string; input: MonthlyReportInput }[] = [
    {
      name: "売上・案件費用・管理費がすべて存在する月",
      input: buildInput({
        businessRows: [
          business(500000, "2026-07-31", "受託案件"),
          business(200000, "2026-07-15", "会員費", "チームB"),
        ],
        costRows: [
          cost(300000, "2026-07-31", "外注費", "受託案件"),
          cost(50000, "2026-07-20", "システム料", "会員費", 2, "チームB"),
        ],
        recurringCosts: [
          recurringCost({ id: 1, price: 30000 }),
          recurringCost({
            id: 2,
            price: 240000,
            payment_cycle: "yearly",
            team: null,
          }),
        ],
        includeTeamBreakdown: true,
      }),
    },
    {
      name: "経理追加収支（収入＋経費・支出）を含む月",
      input: buildInput({
        businessRows: [business(300000, "2026-07-10", "イベント")],
        costRows: [cost(120000, "2026-07-10", "施設利用料", "イベント")],
        recurringCosts: [recurringCost({ id: 1, price: 30000 })],
        extraEntries: [
          extraEntry({
            id: 1,
            entry_type: "income",
            category: "助成金",
            billing_amount: 800000,
            expense_amount: 60000,
          }),
          extraEntry({
            id: 2,
            entry_type: "expense",
            category: "交通費",
            billing_amount: null,
            expense_amount: 15000,
            payment_method: "銀行振込",
          }),
        ],
      }),
    },
    {
      name: "teamleader（全体共通の管理費・経理追加収支を算入しない）",
      input: buildInput({
        isTeamLeader: true,
        businessRows: [business(400000, "2026-07-05", "研修・検定")],
        costRows: [cost(90000, "2026-07-05", "メンバー報酬", "研修・検定")],
        recurringCosts: [
          recurringCost({ id: 1, price: 20000, team: "チームA" }),
          recurringCost({ id: 2, price: 70000, team: null }),
        ],
        extraEntries: [
          extraEntry({
            id: 1,
            entry_type: "expense",
            category: "会議費",
            billing_amount: null,
            expense_amount: 8000,
            team: null,
            payment_method: "銀行振込",
          }),
          extraEntry({
            id: 2,
            entry_type: "income",
            category: "協賛金",
            billing_amount: 50000,
            team: "チームA",
          }),
        ],
      }),
    },
    {
      name: "赤字（マイナスの経理追加収支による減額調整を含む）月",
      input: buildInput({
        businessRows: [business(100000, "2026-07-01", "ボードゲーム")],
        costRows: [cost(250000, "2026-07-01", "備品購入", "ボードゲーム")],
        recurringCosts: [recurringCost({ id: 1, price: 30000 })],
        extraEntries: [
          extraEntry({
            id: 1,
            entry_type: "income",
            category: "その他収入",
            billing_amount: -20000,
          }),
        ],
      }),
    },
    {
      name: "月未確定データ・対象外の月のデータが混在する月",
      input: buildInput({
        // 対象月のデータ（非ゼロの損益になるようにして回帰検知力を確保する）
        businessRows: [
          business(450000, "2026-07-12", "受託案件"),
          business(700000, null, "受託案件"),
          business(300000, "2026-08-01", "受託案件"),
        ],
        costRows: [
          cost(120000, "2026-07-12", "外注費", "受託案件"),
          cost(200000, null, "外注費", "受託案件"),
          cost(100000, "2026-06-30", "外注費", "受託案件"),
        ],
        recurringCosts: [
          recurringCost({ id: 1, price: 25000 }),
          recurringCost({ id: 2, price: 30000, end_month: "2026-06-01" }),
        ],
        extraEntries: [
          extraEntry({
            id: 1,
            entry_type: "income",
            category: "協賛金",
            entry_date: null,
            billing_amount: 90000,
          }),
          extraEntry({
            id: 2,
            entry_type: "expense",
            category: "通信費",
            billing_amount: null,
            expense_amount: 7000,
            payment_method: "銀行振込",
          }),
        ],
      }),
    },
  ];

  it.each(cases)("$name", ({ input }) => {
    const report = buildMonthlyReport(input);
    const legacy = legacyOperatingProfit(input);
    // 「0 === 0」の自明な一致で通ってしまわないよう、各ケースが非ゼロであることも確認する
    expect(legacy).not.toBe(0);
    expect(report.ordinaryProfit).toBe(legacy);
  });

  it("刷新前の計算式（売上 − 案件費用 − 管理費）と一致する", () => {
    const input = cases[0].input;
    const report = buildMonthlyReport(input);
    expect(report.ordinaryProfit).toBe(
      report.revenueTotal - report.matterCostTotal - report.recurringCostTotal,
    );
  });
});

describe("buildMonthlyReport: チーム別内訳", () => {
  it("accounting / admin ではチームごとの粗利と経常利益を算出する", () => {
    const report = buildMonthlyReport(
      buildInput({
        includeTeamBreakdown: true,
        businessRows: [
          business(500000, "2026-07-31", "受託案件", "チームA"),
          business(200000, "2026-07-31", "会員費", "チームB"),
        ],
        costRows: [
          cost(100000, "2026-07-31", "外注費", "受託案件", 1, "チームA"),
        ],
        recurringCosts: [
          recurringCost({ id: 1, price: 30000, team: "チームA" }),
          recurringCost({ id: 2, price: 40000, team: null }),
        ],
      }),
    );

    const teamA = report.byTeam?.find((row) => row.team === "チームA");
    expect(teamA).toMatchObject({
      revenue: 500000,
      matterCost: 100000,
      grossProfit: 400000,
      recurringCost: 30000,
      profit: 370000,
    });

    const orgWide = report.byTeam?.find((row) => row.team === "全体共通");
    expect(orgWide).toMatchObject({
      revenue: 0,
      matterCost: 0,
      grossProfit: 0,
      recurringCost: 40000,
      profit: -40000,
    });
  });

  it("teamleader ではチーム別内訳を返さない", () => {
    const report = buildMonthlyReport(buildInput({ isTeamLeader: true }));
    expect(report.byTeam).toBeUndefined();
  });
});

// 全体共通（team IS NULL）の扱いはロールで異なる（docs/specification.md §4.16.4）
describe("buildMonthlyReport: ロール別の表示スコープ", () => {
  // teamleader は全体共通を損益に算入せず参考表示へ、accounting / admin は算入する
  const orgWideInput = (isTeamLeader: boolean) =>
    buildInput({
      isTeamLeader,
      includeTeamBreakdown: !isTeamLeader,
      businessRows: [business(300000, "2026-07-10", "受託案件")],
      costRows: [cost(50000, "2026-07-10", "外注費", "受託案件")],
      recurringCosts: [
        recurringCost({ id: 1, item: "システム料", price: 10000 }),
        recurringCost({
          id: 2,
          item: "施設利用料",
          price: 70000,
          team: null,
        }),
      ],
      extraEntries: [
        extraEntry({
          id: 1,
          entry_type: "income",
          category: "協賛金",
          billing_amount: 100000,
          expense_amount: 40000,
          team: null, // 全体共通
        }),
        extraEntry({
          id: 2,
          entry_type: "expense",
          category: "交通費",
          billing_amount: null,
          expense_amount: 5000,
          team: "チームA",
          payment_method: "銀行振込",
        }),
      ],
    });

  it("teamleader: 全体共通の経理追加収支を売上・粗利・費用内訳から除外し参考表示へ分離する", () => {
    const report = buildMonthlyReport(orgWideInput(true));

    // 全体共通の収入エントリ（協賛金）は売上・粗利のどちらにも現れない
    expect(report.revenueByCategory.map((row) => row.category)).not.toContain(
      "協賛金",
    );
    expect(
      report.grossProfitByCategory.map((row) => row.category),
    ).not.toContain("協賛金");
    expect(report.revenueTotal).toBe(300000);

    // 自チームの支出エントリ（交通費）は算入される
    expect(report.grossProfitByCategory).toContainEqual({
      category: "交通費",
      revenue: 0,
      cost: 5000,
      grossProfit: -5000,
    });
    expect(report.matterCostTotal).toBe(55000);
    expect(report.grossProfitTotal).toBe(245000);

    // 参考表示側に全体共通の管理費・経理追加収支が入る
    expect(report.orgWideExtraEntries?.map((entry) => entry.id)).toEqual([1]);
    expect(
      report.orgWideRecurringCosts?.map((detail) => detail.recurringCost.id),
    ).toEqual([2]);
    expect(report.extraEntries.map((entry) => entry.id)).toEqual([2]);

    // 管理費は自チーム分のみ
    expect(report.recurringCostTotal).toBe(10000);
    expect(report.recurringCostByItem.map((row) => row.item)).toEqual([
      "システム料",
    ]);
    expect(report.ordinaryProfit).toBe(235000);
  });

  it("accounting / admin: 全体共通も損益に算入し、参考表示セクションを持たない", () => {
    const report = buildMonthlyReport(orgWideInput(false));

    // 全体共通の収入エントリも売上・粗利に算入される
    expect(report.revenueTotal).toBe(400000);
    expect(report.grossProfitByCategory).toContainEqual({
      category: "協賛金",
      revenue: 100000,
      cost: 40000,
      grossProfit: 60000,
    });

    // 参考表示セクションは出さない（＝分離しない）
    expect(report.orgWideExtraEntries).toBeUndefined();
    expect(report.orgWideRecurringCosts).toBeUndefined();
    expect(report.extraEntries.map((entry) => entry.id)).toEqual([1, 2]);

    // 全体共通の管理費も費目別内訳・管理費合計に算入される
    expect(report.recurringCostTotal).toBe(80000);
    expect(report.recurringCostByItem.map((row) => row.item)).toEqual([
      "施設利用料",
      "システム料",
    ]);
    expect(report.ordinaryProfit).toBe(225000);
    expect(report.byTeam).toBeDefined();
  });
});

describe("buildMonthlyReport: 分類別売上内訳・品目別費用内訳", () => {
  it("同じ分類の売上をまとめ、経理追加収支の請求額も合算して降順に並べる", () => {
    const report = buildMonthlyReport(
      buildInput({
        businessRows: [
          business(100000, "2026-07-01", "会員費"),
          business(50000, "2026-07-20", "会員費"),
          business(300000, "2026-07-05", "受託案件"),
          business(999999, "2026-06-30", "イベント"), // 対象外の月
        ],
        extraEntries: [
          extraEntry({
            id: 1,
            entry_type: "income",
            category: "会員費",
            billing_amount: 20000,
          }),
        ],
      }),
    );

    expect(
      report.revenueByCategory.map((row) => ({
        category: row.category,
        amount: row.amount,
      })),
    ).toEqual([
      { category: "受託案件", amount: 300000 },
      { category: "会員費", amount: 170000 },
    ]);
    expect(report.revenueTotal).toBe(470000);

    // 分類配下には案件（business 行）別の明細を実績額の降順で持つ（実績額修正の対象単位）
    const memberFeeCategory = report.revenueByCategory.find(
      (row) => row.category === "会員費",
    );
    expect(memberFeeCategory?.businesses.map((b) => b.actualAmount)).toEqual([
      100000, 50000,
    ]);
  });

  it("品目別に案件費用行を保持し（cost_id 単位。同一案件でも合算しない）、経理追加収支の経費を分類名の品目行として合算する", () => {
    const report = buildMonthlyReport(
      buildInput({
        costRows: [
          cost(30000, "2026-07-01", "外注費", "受託案件", 1),
          cost(20000, "2026-07-15", "外注費", "受託案件", 1), // 同一案件・同一品目でも実績額修正は cost_id 単位のため個別の行として残る
          cost(80000, "2026-07-10", "外注費", "受託案件", 2),
          cost(10000, "2026-07-10", "備品購入", "イベント", 3),
        ],
        extraEntries: [
          extraEntry({
            id: 1,
            entry_type: "expense",
            category: "備品購入", // 品目マスタと同名 → 同じ行へ合算される
            billing_amount: null,
            expense_amount: 5000,
            payment_method: "銀行振込",
          }),
        ],
      }),
    );

    const outsourcing = report.matterCostByItem.find(
      (row) => row.item === "外注費",
    );
    expect(outsourcing?.amount).toBe(130000);
    expect(
      outsourcing?.costs.map((c) => ({
        matterId: c.matterId,
        actualAmount: c.actualAmount,
      })),
    ).toEqual([
      { matterId: 2, actualAmount: 80000 },
      { matterId: 1, actualAmount: 30000 },
      { matterId: 1, actualAmount: 20000 },
    ]);
    expect(outsourcing?.extraEntries).toEqual([]);

    const supplies = report.matterCostByItem.find(
      (row) => row.item === "備品購入",
    );
    expect(supplies?.amount).toBe(15000);
    expect(supplies?.costs.map((c) => c.matterId)).toEqual([3]);
    expect(supplies?.extraEntries.map((entry) => entry.id)).toEqual([1]);

    // 品目別内訳の合計は案件費用合計と一致する
    expect(
      report.matterCostByItem.reduce((sum, row) => sum + row.amount, 0),
    ).toBe(report.matterCostTotal);
  });
});

describe("buildMonthlyReport: 月未確定（日付未入力）", () => {
  it("日付未入力の売上・費用を別枠で集計し、月次の集計には含めない", () => {
    const report = buildMonthlyReport(
      buildInput({
        businessRows: [
          business(100000, "2026-07-01", "会員費"),
          business(700000, null, "受託案件"),
        ],
        costRows: [
          cost(20000, "2026-07-01", "外注費", "会員費"),
          cost(200000, null, "外注費", "受託案件"),
        ],
        extraEntries: [
          extraEntry({
            id: 1,
            entry_type: "income",
            category: "協賛金",
            entry_date: null,
            billing_amount: 90000,
            expense_amount: 8000,
          }),
        ],
      }),
    );

    expect(report.undated).toEqual({
      revenue: 790000, // 700000 + 90000
      matterCost: 208000, // 200000 + 8000
    });
    expect(report.revenueTotal).toBe(100000);
    expect(report.matterCostTotal).toBe(20000);
    expect(report.grossProfitTotal).toBe(80000);
  });

  it("月未確定のデータがない場合は 0 になる", () => {
    const report = buildMonthlyReport(
      buildInput({
        businessRows: [business(100000, "2026-07-01", "会員費")],
      }),
    );
    expect(report.undated).toEqual({ revenue: 0, matterCost: 0 });
  });
});

// 損益調整（profit_loss_adjustments）: 元データ + 調整 = 実績（Issue #108）
describe("buildMonthlyReport: 損益調整（実績額修正）", () => {
  it("調整が無い場合は元データ金額のまま実績額になる", () => {
    const report = buildMonthlyReport(
      buildInput({
        businessRows: [business(100000, "2026-07-01", "受託案件")],
      }),
    );
    const detail = report.revenueByCategory[0].businesses[0];
    expect(detail).toMatchObject({
      sourceAmount: 100000,
      adjustmentAmount: 0,
      actualAmount: 100000,
      sourceChanged: false,
      adjustment: null,
    });
  });

  it("案件の売上（business）の調整が実績額・分類別売上・売上合計に反映される", () => {
    const row = business(100000, "2026-07-01", "受託案件");
    const report = buildMonthlyReport(
      buildInput({
        businessRows: [row],
        adjustments: [
          adjustment({
            id: 1,
            business_id: row.id,
            adjustment_amount: 20000,
            source_amount_snapshot: 100000,
          }),
        ],
      }),
    );

    const detail = report.revenueByCategory[0].businesses[0];
    expect(detail.actualAmount).toBe(120000);
    expect(detail.adjustment?.id).toBe(1);
    expect(report.revenueByCategory[0].amount).toBe(120000);
    expect(report.revenueTotal).toBe(120000);
  });

  it("案件費用（cost）の調整が実績額・品目別費用・案件費用合計に反映される", () => {
    const row = cost(30000, "2026-07-01", "外注費", "受託案件");
    const report = buildMonthlyReport(
      buildInput({
        costRows: [row],
        adjustments: [
          adjustment({
            id: 1,
            cost_id: row.id,
            adjustment_amount: -5000,
            source_amount_snapshot: 30000,
          }),
        ],
      }),
    );

    const detail = report.matterCostByItem[0].costs[0];
    expect(detail.actualAmount).toBe(25000);
    expect(report.matterCostByItem[0].amount).toBe(25000);
    expect(report.matterCostTotal).toBe(25000);
  });

  it("管理費（recurring_cost）の調整が実績額・費目別内訳・管理費合計に反映される", () => {
    const rc = recurringCost({ id: 1, price: 10000 });
    const report = buildMonthlyReport(
      buildInput({
        recurringCosts: [rc],
        adjustments: [
          adjustment({
            id: 1,
            recurring_cost_id: 1,
            adjustment_amount: 3000,
            source_amount_snapshot: 10000,
          }),
        ],
      }),
    );

    const detail = report.recurringCostByItem[0].details[0];
    expect(detail.actualAmount).toBe(13000);
    expect(report.recurringCostTotal).toBe(13000);
  });

  it("対象月が異なる調整は適用されない", () => {
    const row = business(100000, "2026-07-01", "受託案件");
    const report = buildMonthlyReport(
      buildInput({
        businessRows: [row],
        adjustments: [
          adjustment({
            id: 1,
            business_id: row.id,
            target_month: "2026-08-01", // 対象月が異なる（当月には適用しない）
            adjustment_amount: 20000,
            source_amount_snapshot: 100000,
          }),
        ],
      }),
    );

    const detail = report.revenueByCategory[0].businesses[0];
    expect(detail.adjustment).toBeNull();
    expect(detail.actualAmount).toBe(100000);
  });

  it("調整保存後に元データが変更されると sourceChanged が true になり、実績額は現在の元データを基準に計算される", () => {
    // 調整保存時点（source_amount_snapshot）は 100000 円だったが、
    // その後元データ（business.amount）が 150000 円に変更された想定
    const row = business(150000, "2026-07-01", "受託案件");
    const report = buildMonthlyReport(
      buildInput({
        businessRows: [row],
        adjustments: [
          adjustment({
            id: 1,
            business_id: row.id,
            adjustment_amount: 20000,
            source_amount_snapshot: 100000,
          }),
        ],
      }),
    );

    const detail = report.revenueByCategory[0].businesses[0];
    expect(detail.sourceChanged).toBe(true);
    // 調整の差分（+20000）は自動更新されないため、実績額 = 現在の元データ + 差分
    expect(detail.actualAmount).toBe(170000);
  });

  it("対象行が当月に存在しない調整は orphanedAdjustments に含まれ、損益には反映されない（accounting / admin のみ）", () => {
    // 案件の請求日が翌月へ変更される等で、調整の対象行（business_id=99）が当月の
    // 集計対象（monthlyBusiness）から外れたケース。対象行自体は削除されていないため
    // CASCADE では消えず、調整だけが「対象行が当月に存在しない」状態で残る
    const report = buildMonthlyReport(
      buildInput({
        includeTeamBreakdown: true,
        businessRows: [business(100000, "2026-08-01", "受託案件")], // 対象行は8月分として存在
        adjustments: [
          adjustment({
            id: 42,
            business_id: 99,
            target_month: "2026-07-01",
            adjustment_amount: 5000,
            source_amount_snapshot: 100000,
          }),
        ],
      }),
    );

    expect(report.orphanedAdjustments).toHaveLength(1);
    expect(report.orphanedAdjustments?.[0]).toMatchObject({
      targetType: "business",
      adjustment: { id: 42 },
    });
    expect(report.revenueTotal).toBe(0);
  });

  it("cost / recurring_cost が対象の場合も対象種別が正しく判定される", () => {
    const report = buildMonthlyReport(
      buildInput({
        includeTeamBreakdown: true,
        adjustments: [
          adjustment({ id: 1, cost_id: 99, target_month: "2026-07-01" }),
          adjustment({
            id: 2,
            recurring_cost_id: 98,
            target_month: "2026-07-01",
          }),
        ],
      }),
    );

    expect(report.orphanedAdjustments?.map((o) => o.targetType).sort()).toEqual(
      ["cost", "recurring_cost"],
    );
  });

  it("includeTeamBreakdown が false（teamleader）では orphanedAdjustments を返さない", () => {
    const report = buildMonthlyReport(
      buildInput({
        includeTeamBreakdown: false,
        adjustments: [
          adjustment({ id: 1, business_id: 99, target_month: "2026-07-01" }),
        ],
      }),
    );

    expect(report.orphanedAdjustments).toBeUndefined();
  });

  it("チーム別内訳にも調整後の実績額が反映される（本表と同じ実績額を使う）", () => {
    const businessRow = business(100000, "2026-07-31", "受託案件", "チームA");
    const costRow = cost(
      30000,
      "2026-07-31",
      "外注費",
      "受託案件",
      1,
      "チームA",
    );
    const recurringCostRow = recurringCost({
      id: 1,
      price: 10000,
      team: "チームA",
    });

    const report = buildMonthlyReport(
      buildInput({
        includeTeamBreakdown: true,
        businessRows: [businessRow],
        costRows: [costRow],
        recurringCosts: [recurringCostRow],
        adjustments: [
          adjustment({
            id: 1,
            business_id: businessRow.id,
            adjustment_amount: 20000,
            source_amount_snapshot: 100000,
          }),
          adjustment({
            id: 2,
            cost_id: costRow.id,
            adjustment_amount: -5000,
            source_amount_snapshot: 30000,
          }),
          adjustment({
            id: 3,
            recurring_cost_id: 1,
            adjustment_amount: 3000,
            source_amount_snapshot: 10000,
          }),
        ],
      }),
    );

    const teamA = report.byTeam?.find((row) => row.team === "チームA");
    expect(teamA).toMatchObject({
      revenue: 120000, // 100000 + 20000
      matterCost: 25000, // 30000 - 5000
      recurringCost: 13000, // 10000 + 3000
    });
  });

  it("経理追加収支の収入は分類別売上内訳の extraEntries にも含まれる", () => {
    const report = buildMonthlyReport(
      buildInput({
        extraEntries: [
          extraEntry({
            id: 1,
            entry_type: "income",
            category: "協賛金",
            billing_amount: 50000,
          }),
        ],
      }),
    );

    const category = report.revenueByCategory.find(
      (row) => row.category === "協賛金",
    );
    expect(category?.extraEntries.map((entry) => entry.id)).toEqual([1]);
    expect(category?.businesses).toEqual([]);
    expect(category?.amount).toBe(50000);
  });
});
