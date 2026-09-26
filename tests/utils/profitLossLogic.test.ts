import { beforeEach, describe, expect, it } from "vitest";
import {
  BusinessRow,
  CostRow,
  MonthlyReportInput,
  fiscalYearMonths,
  isDraftMatter,
  isRecurringCostChargedInMonth,
  monthDiff,
  normalizeLabelInput,
  reportFlags,
  resolveTitle,
} from "@/app/utils/profitLossLogic";
import { buildMonthReport } from "@/app/utils/profitLossClosing";
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
  startDate: string | null,
  category: string,
  team = "チームA",
  matterId = 1,
): BusinessRow => {
  const id = nextBusinessId++;
  return {
    id,
    name: `取引先${id}`,
    amount,
    matter_id: matterId,
    matters: {
      id: matterId,
      user_id: 1,
      title: `案件${matterId}`,
      team,
      category,
      start_date: startDate,
      is_fixed: true,
      is_completed: false,
    },
  };
};

const cost = (
  price: number,
  startDate: string | null,
  item: string,
  category: string,
  matterId = 1,
  team = "チームA",
): CostRow => {
  const id = nextCostId++;
  return {
    id,
    name: `支払先${id}`,
    price,
    item,
    matter_id: matterId,
    matters: {
      id: matterId,
      user_id: 1,
      title: `案件${matterId}`,
      team,
      category,
      start_date: startDate,
      is_fixed: true,
      is_completed: false,
    },
  };
};

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
  includeMonthlyDetails: true,
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
      .filter((row) => toMonthKey(row.matters.start_date) === month)
      .reduce((sum, row) => sum + (row.amount ?? 0), 0) +
    countedExtraEntries
      .filter((entry) => entry.entry_type === "income")
      .reduce((sum, entry) => sum + (entry.billing_amount ?? 0), 0);

  const matterCostTotal =
    costRows
      .filter((row) => toMonthKey(row.matters.start_date) === month)
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

describe("buildMonthReport: 売上総利益（粗利）の分類別集計", () => {
  it("案件費用を案件の分類へ振り分け、分類別に 売上 − 案件費用 を集計する", () => {
    const report = buildMonthReport(
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

    expect(report.categoryBreakdown).toEqual([
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
    const report = buildMonthReport(
      buildInput({
        businessRows: [
          business(100000, "2026-07-01", "会員費"),
          business(900000, "2026-07-01", "受託案件"),
          business(300000, "2026-07-01", "イベント"),
        ],
      }),
    );

    expect(report.categoryBreakdown.map((row) => row.category)).toEqual([
      "受託案件",
      "イベント",
      "会員費",
    ]);
  });

  it("売上のない分類の費用は粗利がマイナスの行として現れる", () => {
    const report = buildMonthReport(
      buildInput({
        businessRows: [business(100000, "2026-07-01", "会員費")],
        costRows: [cost(80000, "2026-07-01", "外注費", "受託案件")],
      }),
    );

    expect(report.categoryBreakdown).toContainEqual({
      category: "受託案件",
      revenue: 0,
      cost: 80000,
      grossProfit: -80000,
    });
  });

  it("経理追加収支の請求額・経費をエントリの分類の粗利へ算入する", () => {
    const report = buildMonthReport(
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

    expect(report.categoryBreakdown).toContainEqual({
      category: "受託収入",
      revenue: 400000,
      cost: 100000,
      grossProfit: 300000,
    });
    expect(report.categoryBreakdown).toContainEqual({
      category: "消耗品費",
      revenue: 0,
      cost: 30000,
      grossProfit: -30000,
    });
  });

  it("分類別粗利の合計は 売上合計 − 案件費用合計 と一致する", () => {
    const report = buildMonthReport(
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

    const sum = report.categoryBreakdown.reduce(
      (total, row) => total + row.grossProfit,
      0,
    );
    expect(sum).toBe(report.grossProfitTotal);
    expect(report.grossProfitTotal).toBe(
      report.revenueTotal - report.matterCostTotal,
    );
  });

  it("対象月以外の売上・費用は粗利に含めない", () => {
    const report = buildMonthReport(
      buildInput({
        businessRows: [business(500000, "2026-08-01", "受託案件")],
        costRows: [cost(300000, "2026-06-30", "外注費", "受託案件")],
      }),
    );

    expect(report.categoryBreakdown).toEqual([]);
    expect(report.grossProfitTotal).toBe(0);
  });
});

describe("buildMonthReport: 管理費の費目別集計", () => {
  it("同一費目の定期費用をまとめ、明細を保持する", () => {
    const report = buildMonthReport(
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
        (detail) => detail.recurringCostId,
      ),
    ).toEqual([1, 2]);
  });

  it("費目別内訳の合計は管理費合計と一致する", () => {
    const report = buildMonthReport(
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
    const report = buildMonthReport(
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
      report.orgWideRecurringCosts?.map((detail) => detail.recurringCostId),
    ).toEqual([2]);
  });
});

describe("buildMonthReport: 経常利益", () => {
  it("経常利益 = 粗利合計 − 管理費合計", () => {
    const report = buildMonthReport(
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
describe("buildMonthReport: 経常利益が刷新前の営業損益と一致する", () => {
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
    const report = buildMonthReport(input);
    const legacy = legacyOperatingProfit(input);
    // 「0 === 0」の自明な一致で通ってしまわないよう、各ケースが非ゼロであることも確認する
    expect(legacy).not.toBe(0);
    expect(report.ordinaryProfit).toBe(legacy);
  });

  it("刷新前の計算式（売上 − 案件費用 − 管理費）と一致する", () => {
    const input = cases[0].input;
    const report = buildMonthReport(input);
    expect(report.ordinaryProfit).toBe(
      report.revenueTotal - report.matterCostTotal - report.recurringCostTotal,
    );
  });
});

describe("buildMonthReport: チーム別内訳", () => {
  it("accounting / admin ではチームごとの粗利と経常利益を算出する", () => {
    const report = buildMonthReport(
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
    const report = buildMonthReport(buildInput({ isTeamLeader: true }));
    expect(report.byTeam).toBeUndefined();
  });
});

// 全体共通（team IS NULL）の扱いはロールで異なる（docs/specification.md §4.16.4）
describe("buildMonthReport: ロール別の表示スコープ", () => {
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
    const report = buildMonthReport(orgWideInput(true));

    // 全体共通の収入エントリ（協賛金）は案件別収支・分類別収支のどちらにも現れない
    expect(report.teamMatterGroups.map((group) => group.team)).not.toContain(
      null,
    );
    expect(report.categoryBreakdown.map((row) => row.category)).not.toContain(
      "協賛金",
    );
    expect(report.revenueTotal).toBe(300000);

    // 自チームの支出エントリ（交通費）は算入される
    expect(report.categoryBreakdown).toContainEqual({
      category: "交通費",
      revenue: 0,
      cost: 5000,
      grossProfit: -5000,
    });
    expect(report.matterCostTotal).toBe(55000);
    expect(report.grossProfitTotal).toBe(245000);

    // 参考表示側に全体共通の管理費・経理追加収支が入る
    expect(
      report.orgWideExtraEntries?.map((entry) => entry.extraEntryId),
    ).toEqual([1]);
    expect(
      report.orgWideRecurringCosts?.map((detail) => detail.recurringCostId),
    ).toEqual([2]);
    expect(report.extraEntries.map((entry) => entry.extraEntryId)).toEqual([2]);

    // 管理費は自チーム分のみ
    expect(report.recurringCostTotal).toBe(10000);
    expect(report.recurringCostByItem.map((row) => row.item)).toEqual([
      "システム料",
    ]);
    expect(report.ordinaryProfit).toBe(235000);
  });

  it("accounting / admin: 全体共通も損益に算入し、参考表示セクションを持たない", () => {
    const report = buildMonthReport(orgWideInput(false));

    // 全体共通の収入エントリも売上・粗利に算入される
    expect(report.revenueTotal).toBe(400000);
    expect(report.categoryBreakdown).toContainEqual({
      category: "協賛金",
      revenue: 100000,
      cost: 40000,
      grossProfit: 60000,
    });

    // 参考表示セクションは出さない（＝分離しない）
    expect(report.orgWideExtraEntries).toBeUndefined();
    expect(report.orgWideRecurringCosts).toBeUndefined();
    expect(report.extraEntries.map((entry) => entry.extraEntryId)).toEqual([
      1, 2,
    ]);

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

describe("buildMonthReport: 案件別収支（Issue #147）", () => {
  it("チーム → 案件 → 案件内訳の階層で、案件の売上・費用・粗利を集計する", () => {
    const report = buildMonthReport(
      buildInput({
        businessRows: [
          business(1000000, "2026-07-01", "受託案件", "チームA", 12),
          business(500000, "2026-07-01", "受託案件", "チームA", 12),
          business(500000, "2026-07-01", "会員費", "チームA", 15),
        ],
        costRows: [
          cost(700000, "2026-07-01", "外注費", "受託案件", 12, "チームA"),
          cost(200000, "2026-07-01", "外注費", "会員費", 15, "チームA"),
        ],
      }),
    );

    expect(report.teamMatterGroups).toHaveLength(1);
    const [group] = report.teamMatterGroups;
    expect(group).toMatchObject({
      team: "チームA",
      revenue: 2000000,
      cost: 900000,
      grossProfit: 1100000,
    });
    expect(
      group.matters.map((matter) => ({
        matterId: matter.matterId,
        category: matter.category,
        revenue: matter.revenue,
        cost: matter.cost,
        grossProfit: matter.grossProfit,
      })),
    ).toEqual([
      {
        matterId: 12,
        category: "受託案件",
        revenue: 1500000,
        cost: 700000,
        grossProfit: 800000,
      },
      {
        matterId: 15,
        category: "会員費",
        revenue: 500000,
        cost: 200000,
        grossProfit: 300000,
      },
    ]);
    // 案件内訳は売上明細・費用明細をそれぞれ ID 昇順で持つ（同一案件でも合算しない）
    expect(group.matters[0].businesses.map((line) => line.businessId)).toEqual([
      1, 2,
    ]);
    expect(group.matters[0].costs.map((line) => line.costId)).toEqual([1]);
  });

  it("チームはマスタの並び順、マスタに無いチームは名称順で後ろ、全体共通は最後に並ぶ", () => {
    const report = buildMonthReport(
      buildInput({
        teamOrder: ["シンラボ", "SDGs"],
        businessRows: [
          business(1, "2026-07-01", "会員費", "旧チームB", 1),
          business(1, "2026-07-01", "会員費", "SDGs", 2),
          business(1, "2026-07-01", "会員費", "旧チームA", 3),
          business(1, "2026-07-01", "会員費", "シンラボ", 4),
        ],
        extraEntries: [extraEntry({ id: 1, team: null, billing_amount: 100 })],
      }),
    );
    expect(report.teamMatterGroups.map((group) => group.team)).toEqual([
      "シンラボ",
      "SDGs",
      "旧チームA",
      "旧チームB",
      null,
    ]);
  });

  it("案件は ID の昇順に並ぶ", () => {
    const report = buildMonthReport(
      buildInput({
        businessRows: [
          business(1, "2026-07-01", "会員費", "チームA", 30),
          business(999, "2026-07-01", "会員費", "チームA", 5),
          business(10, "2026-07-01", "会員費", "チームA", 17),
        ],
      }),
    );
    expect(
      report.teamMatterGroups[0].matters.map((matter) => matter.matterId),
    ).toEqual([5, 17, 30]);
  });

  it("売上のみ・費用のみの案件も片方を 0 として表示する", () => {
    const report = buildMonthReport(
      buildInput({
        businessRows: [business(100000, "2026-07-01", "会員費", "チームA", 1)],
        costRows: [cost(40000, "2026-07-01", "外注費", "イベント", 2)],
      }),
    );
    expect(
      report.teamMatterGroups[0].matters.map((matter) => ({
        matterId: matter.matterId,
        revenue: matter.revenue,
        cost: matter.cost,
        grossProfit: matter.grossProfit,
      })),
    ).toEqual([
      { matterId: 1, revenue: 100000, cost: 0, grossProfit: 100000 },
      { matterId: 2, revenue: 0, cost: 40000, grossProfit: -40000 },
    ]);
  });

  it("経理追加収支はエントリのチームの「案件外」行にまとめ、チーム未指定は全体共通に入れる", () => {
    const report = buildMonthReport(
      buildInput({
        businessRows: [business(100000, "2026-07-01", "会員費", "チームA", 1)],
        extraEntries: [
          extraEntry({
            id: 2,
            team: "チームA",
            entry_type: "income",
            billing_amount: 30000,
            expense_amount: 10000,
          }),
          extraEntry({
            id: 3,
            team: null,
            entry_type: "expense",
            category: "交通費",
            expense_amount: 5000,
            payment_method: "現金",
          }),
        ],
      }),
    );
    const [teamA, orgWide] = report.teamMatterGroups;
    expect(teamA).toMatchObject({
      team: "チームA",
      extraRevenue: 30000,
      extraCost: 10000,
      revenue: 130000,
      cost: 10000,
      grossProfit: 120000,
    });
    expect(teamA.extraEntries.map((entry) => entry.extraEntryId)).toEqual([2]);
    expect(orgWide).toMatchObject({
      team: null,
      matters: [],
      extraRevenue: 0,
      extraCost: 5000,
      grossProfit: -5000,
    });
  });

  it("チーム小計の合計・分類別収支の合計・サマリー（売上 − 案件費用）がすべて一致する", () => {
    const report = buildMonthReport(
      buildInput({
        businessRows: [
          business(100000, "2026-07-01", "会員費", "チームA", 1),
          business(300000, "2026-07-01", "受託案件", "チームB", 2),
        ],
        costRows: [
          cost(50000, "2026-07-01", "外注費", "受託案件", 2, "チームB"),
          cost(10000, "2026-07-01", "備品購入", "会員費", 1, "チームA"),
        ],
        extraEntries: [
          extraEntry({
            id: 1,
            team: null,
            category: "協賛金",
            billing_amount: 20000,
            expense_amount: 3000,
          }),
        ],
        adjustments: [
          adjustment({
            id: 1,
            business_id: 1,
            adjustment_amount: -5000,
            source_amount_snapshot: 100000,
          }),
        ],
      }),
    );
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
    const groupRevenue = sum(report.teamMatterGroups.map((g) => g.revenue));
    const groupCost = sum(report.teamMatterGroups.map((g) => g.cost));
    const categoryRevenue = sum(report.categoryBreakdown.map((c) => c.revenue));
    const categoryCost = sum(report.categoryBreakdown.map((c) => c.cost));

    expect(report.revenueTotal).toBe(415000);
    expect(report.matterCostTotal).toBe(63000);
    expect(groupRevenue).toBe(report.revenueTotal);
    expect(groupCost).toBe(report.matterCostTotal);
    expect(categoryRevenue).toBe(report.revenueTotal);
    expect(categoryCost).toBe(report.matterCostTotal);
    expect(sum(report.teamMatterGroups.map((g) => g.grossProfit))).toBe(
      report.grossProfitTotal,
    );
    expect(sum(report.categoryBreakdown.map((c) => c.grossProfit))).toBe(
      report.grossProfitTotal,
    );
  });
});

describe("buildMonthReport: 月未確定（日付未入力）", () => {
  it("日付未入力の売上・費用を別枠で集計し、月次の集計には含めない", () => {
    const report = buildMonthReport(
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
    const report = buildMonthReport(
      buildInput({
        businessRows: [business(100000, "2026-07-01", "会員費")],
      }),
    );
    expect(report.undated).toEqual({ revenue: 0, matterCost: 0 });
  });
});

// 損益調整（profit_loss_adjustments）: 元データ + 調整 = 実績（Issue #108）
describe("buildMonthReport: 損益調整（実績額修正）", () => {
  it("調整が無い場合は元データ金額のまま実績額になる", () => {
    const row = business(100000, "2026-07-01", "受託案件");
    const report = buildMonthReport(
      buildInput({
        businessRows: [row],
      }),
    );
    const detail = report.teamMatterGroups[0].matters[0].businesses[0];
    expect(detail).toMatchObject({
      sourceAmount: 100000,
      adjustmentAmount: 0,
      actualAmount: 100000,
      sourceChanged: false,
      adjustment: null,
      name: row.name,
    });
  });

  it("同一案件に複数の business / cost 行があっても取引先名・支払先名で識別できる", () => {
    const row1 = business(100000, "2026-07-01", "受託案件", "チームA", 1);
    const row2 = business(50000, "2026-07-01", "受託案件", "チームA", 1);
    const costRow1 = cost(30000, "2026-07-01", "外注費", "受託案件", 1);
    const costRow2 = cost(20000, "2026-07-01", "外注費", "受託案件", 1);

    const report = buildMonthReport(
      buildInput({
        businessRows: [row1, row2],
        costRows: [costRow1, costRow2],
      }),
    );

    expect(
      report.teamMatterGroups[0].matters[0].businesses.map((b) => b.name),
    ).toEqual(expect.arrayContaining([row1.name, row2.name]));
    expect(
      report.teamMatterGroups[0].matters[0].costs.map((c) => c.name),
    ).toEqual(expect.arrayContaining([costRow1.name, costRow2.name]));
  });

  it("案件の売上（business）の調整が実績額・案件の売上・売上合計に反映される", () => {
    const row = business(100000, "2026-07-01", "受託案件");
    const report = buildMonthReport(
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

    const detail = report.teamMatterGroups[0].matters[0].businesses[0];
    expect(detail.actualAmount).toBe(120000);
    expect(detail.adjustment?.id).toBe(1);
    expect(report.teamMatterGroups[0].matters[0].revenue).toBe(120000);
    expect(report.revenueTotal).toBe(120000);
  });

  it("案件費用（cost）の調整が実績額・案件の費用・案件費用合計に反映される", () => {
    const row = cost(30000, "2026-07-01", "外注費", "受託案件");
    const report = buildMonthReport(
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

    const detail = report.teamMatterGroups[0].matters[0].costs[0];
    expect(detail.actualAmount).toBe(25000);
    expect(report.teamMatterGroups[0].matters[0].cost).toBe(25000);
    expect(report.matterCostTotal).toBe(25000);
  });

  it("管理費（recurring_cost）の調整が実績額・費目別内訳・管理費合計に反映される", () => {
    const rc = recurringCost({ id: 1, price: 10000 });
    const report = buildMonthReport(
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
    const report = buildMonthReport(
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

    const detail = report.teamMatterGroups[0].matters[0].businesses[0];
    expect(detail.adjustment).toBeNull();
    expect(detail.actualAmount).toBe(100000);
  });

  it("調整保存後に元データが変更されると sourceChanged が true になり、実績額は現在の元データを基準に計算される", () => {
    // 調整保存時点（source_amount_snapshot）は 100000 円だったが、
    // その後元データ（business.amount）が 150000 円に変更された想定
    const row = business(150000, "2026-07-01", "受託案件");
    const report = buildMonthReport(
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

    const detail = report.teamMatterGroups[0].matters[0].businesses[0];
    expect(detail.sourceChanged).toBe(true);
    // 調整の差分（+20000）は自動更新されないため、実績額 = 現在の元データ + 差分
    expect(detail.actualAmount).toBe(170000);
  });

  it("対象行が当月に存在しない調整は orphanedAdjustments に含まれ、損益には反映されない（accounting / admin のみ）", () => {
    // 案件の請求日が翌月へ変更される等で、調整の対象行（business_id=99）が当月の
    // 集計対象（monthlyBusiness）から外れたケース。対象行自体は削除されていないため
    // CASCADE では消えず、調整だけが「対象行が当月に存在しない」状態で残る
    const report = buildMonthReport(
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
    const report = buildMonthReport(
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
    const report = buildMonthReport(
      buildInput({
        includeTeamBreakdown: false,
        adjustments: [
          adjustment({ id: 1, business_id: 99, target_month: "2026-07-01" }),
        ],
      }),
    );

    expect(report.orphanedAdjustments).toBeUndefined();
  });

  it("includeMonthlyDetails が false（年間推移）では orphanedAdjustments を返さない", () => {
    const report = buildMonthReport(
      buildInput({
        includeTeamBreakdown: true,
        includeMonthlyDetails: false,
        businessRows: [business(100000, "2026-08-01", "受託案件")],
        adjustments: [
          adjustment({
            id: 42,
            business_id: 99,
            target_month: "2026-07-01",
          }),
        ],
      }),
    );

    expect(report.orphanedAdjustments).toBeUndefined();
  });

  it("orphanedAdjustments は対象行を特定できるラベル（案件名 - 取引先/支払先名）を持つ", () => {
    // 対象行（business_id）自体は月をまたいで存在するが、対象月（7月）の集計対象からは
    // 外れているケース。ラベル解決は month でフィルタする前の全件から行う
    const businessRow = business(100000, "2026-08-01", "受託案件");
    const report = buildMonthReport(
      buildInput({
        includeTeamBreakdown: true,
        businessRows: [businessRow],
        adjustments: [
          adjustment({
            id: 42,
            business_id: businessRow.id,
            target_month: "2026-07-01",
          }),
        ],
      }),
    );

    expect(report.orphanedAdjustments?.[0].label).toBe(
      `${businessRow.matters.title} - ${businessRow.name}`,
    );
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

    const report = buildMonthReport(
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
    // チームが1つだけのため、本表の合計とも一致するはず（本表とチーム別内訳が
    // 別の計算経路でズレていないことを担保する不変条件）
    expect(teamA?.revenue).toBe(report.revenueTotal);
    expect(teamA?.matterCost).toBe(report.matterCostTotal);
    expect(teamA?.recurringCost).toBe(report.recurringCostTotal);
  });
});

describe("isDraftMatter", () => {
  it("経理申請前（is_fixed・is_completed ともに false / NULL）のみ下書き", () => {
    expect(isDraftMatter({ is_fixed: false, is_completed: false })).toBe(true);
    expect(isDraftMatter({ is_fixed: null, is_completed: null })).toBe(true);
    expect(isDraftMatter({ is_fixed: true, is_completed: false })).toBe(false);
    expect(isDraftMatter({ is_fixed: true, is_completed: true })).toBe(false);
    expect(isDraftMatter({ is_fixed: false, is_completed: true })).toBe(false);
  });
});

describe("buildMonthReport: 案件開始日基準の計上（Issue #146）", () => {
  // 1 案件の売上・費用。旧基準（請求日・支払期限）では別の月に分かれていたケースでも、
  // 行が持つ案件開始日だけで計上月が決まる
  const matterRows = (
    startDate: string | null,
    state: { is_fixed: boolean | null; is_completed: boolean | null } = {
      is_fixed: true,
      is_completed: false,
    },
  ) => {
    const b = business(100000, startDate, "受託案件");
    const c = cost(30000, startDate, "外注費", "受託案件");
    b.matters = { ...b.matters, ...state };
    c.matters = { ...c.matters, ...state };
    return { businessRows: [b], costRows: [c] };
  };

  it("売上・費用ともに案件開始日の月に全額計上し、他の月には計上しない", () => {
    const rows = matterRows("2026-07-20");
    const july = buildMonthReport(buildInput({ ...rows }));
    const august = buildMonthReport(buildInput({ ...rows, month: "2026-08" }));
    expect(july.revenueTotal).toBe(100000);
    expect(july.matterCostTotal).toBe(30000);
    expect(july.grossProfitTotal).toBe(70000);
    expect(august.revenueTotal).toBe(0);
    expect(august.matterCostTotal).toBe(0);
  });

  it("下書きの案件はどの月にも月未確定にも計上しない", () => {
    const dated = buildMonthReport(
      buildInput(
        matterRows("2026-07-01", { is_fixed: false, is_completed: false }),
      ),
    );
    expect(dated.revenueTotal).toBe(0);
    expect(dated.matterCostTotal).toBe(0);
    const undated = buildMonthReport(
      buildInput(matterRows(null, { is_fixed: null, is_completed: null })),
    );
    expect(undated.undated).toEqual({ revenue: 0, matterCost: 0 });
  });

  it.each([
    ["経理申請中", { is_fixed: true, is_completed: false }],
    ["経理確認完了・完了", { is_fixed: true, is_completed: true }],
  ])("%s の案件は計上する", (_label, state) => {
    const report = buildMonthReport(
      buildInput(matterRows("2026-07-01", state)),
    );
    expect(report.revenueTotal).toBe(100000);
    expect(report.matterCostTotal).toBe(30000);
  });

  it("案件開始日が未入力の案件（下書き以外）は売上・費用とも月未確定に計上する", () => {
    const report = buildMonthReport(buildInput(matterRows(null)));
    expect(report.revenueTotal).toBe(0);
    expect(report.undated).toEqual({ revenue: 100000, matterCost: 30000 });
  });

  it("案件開始日を別の月へ変更すると計上月が移動し、元の月の調整は対象行が当月に存在しない扱いになる", () => {
    const rows = matterRows("2026-08-05"); // 7月 → 8月へ変更後
    const adjustments = [
      adjustment({
        id: 1,
        target_month: "2026-07-01",
        business_id: rows.businessRows[0].id,
        adjustment_amount: 5000,
        source_amount_snapshot: 100000,
      }),
    ];
    const july = buildMonthReport(
      buildInput({ ...rows, adjustments, includeTeamBreakdown: true }),
    );
    expect(july.revenueTotal).toBe(0);
    expect(july.orphanedAdjustments?.map((o) => o.adjustment.id)).toEqual([1]);
    const august = buildMonthReport(
      buildInput({ ...rows, adjustments, month: "2026-08" }),
    );
    // 調整は 7 月に留まるため 8 月の実績額は元データのまま
    expect(august.revenueTotal).toBe(100000);
  });

  it("年度境界（6月末開始 / 7月1日開始）は開始日の月で振り分ける", () => {
    const june = matterRows("2026-06-30");
    const july = matterRows("2026-07-01");
    const input = {
      businessRows: [...june.businessRows, ...july.businessRows],
      costRows: [...june.costRows, ...july.costRows],
    };
    expect(
      buildMonthReport(buildInput({ ...input, month: "2026-06" })).revenueTotal,
    ).toBe(100000);
    expect(
      buildMonthReport(buildInput({ ...input, month: "2026-07" })).revenueTotal,
    ).toBe(100000);
  });
});

describe("表示タイトル（Issue #150）", () => {
  const label = (
    override: Partial<{
      matter_id: number | null;
      business_id: number | null;
      cost_id: number | null;
      recurring_cost_id: number | null;
    }>,
    text: string,
  ) => ({
    matter_id: null,
    business_id: null,
    cost_id: null,
    recurring_cost_id: null,
    ...override,
    label: text,
  });

  it("resolveTitle は上書きタイトルがあればそれを、無ければ元の名称を返す", () => {
    expect(resolveTitle("元の名前", "上書き")).toEqual({
      displayTitle: "上書き",
      isCustomTitle: true,
    });
    expect(resolveTitle("元の名前", undefined)).toEqual({
      displayTitle: "元の名前",
      isCustomTitle: false,
    });
  });

  it("normalizeLabelInput は前後の空白を除去し、空白のみは削除扱い（null）にする", () => {
    expect(normalizeLabelInput("  経理用  ")).toBe("経理用");
    expect(normalizeLabelInput("   ")).toBeNull();
    expect(normalizeLabelInput("")).toBeNull();
  });

  it("案件・売上明細・費用明細・定期費用ごとに上書きタイトルを解決し、元の名称は保持する", () => {
    const b = business(100000, "2026-07-01", "受託案件", "チームA", 7);
    const c = cost(30000, "2026-07-01", "外注費", "受託案件", 7);
    const report = buildMonthReport(
      buildInput({
        businessRows: [b],
        costRows: [c],
        recurringCosts: [recurringCost({ id: 3 })],
        labels: [
          // 同じ id でも対象種別が違えば別の行（案件 7 と 明細 id 1 を取り違えない）
          { ...label({ matter_id: 7 }, "経理用案件名"), id: 1 },
          { ...label({ business_id: b.id }, "経理用取引先"), id: 2 },
          { ...label({ recurring_cost_id: 3 }, "経理用定期費用"), id: 3 },
        ].map((row) => ({
          ...row,
          updated_by: 1,
          inserted_at: "2026-07-01T00:00:00+09:00",
          updated_at: "2026-07-01T00:00:00+09:00",
        })),
      }),
    );
    const matter = report.teamMatterGroups[0].matters[0];
    expect(matter).toMatchObject({
      matterTitle: "案件7",
      displayTitle: "経理用案件名",
      isCustomTitle: true,
    });
    expect(matter.businesses[0]).toMatchObject({
      name: b.name,
      displayTitle: "経理用取引先",
      isCustomTitle: true,
    });
    expect(matter.costs[0]).toMatchObject({
      name: c.name,
      displayTitle: c.name,
      isCustomTitle: false,
    });
    expect(report.recurringCostByItem[0].details[0]).toMatchObject({
      name: "定期費用3",
      displayTitle: "経理用定期費用",
    });
    // タイトルは金額・集計に影響しない
    expect(report.revenueTotal).toBe(100000);
  });
});
