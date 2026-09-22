import { describe, expect, it } from "vitest";
import {
  BusinessRow,
  CostRow,
  buildMonthlyReport,
  datedOrUndatedFilter,
  doesRecurringCostOverlapRange,
  fiscalYearMonths,
  isAdjustmentInRange,
  isDateInRangeOrUndated,
  isMonthKey,
  recurringOverlapEndFilter,
  reportRangeBounds,
} from "@/app/utils/profitLossLogic";
import {
  ExtraEntryType,
  ProfitLossAdjustmentType,
  RecurringCostType,
} from "@/app/types/types";

let nextId = 1;

const business = (
  amount: number | null,
  invoiceDate: string | null,
): BusinessRow => {
  const id = nextId++;
  return {
    id,
    name: `取引先${id}`,
    amount,
    invoice_date: invoiceDate,
    matter_id: 1,
    matters: { id: 1, title: "案件1", team: "チームA", category: "受託案件" },
  };
};

const cost = (price: number, period: string | null): CostRow => {
  const id = nextId++;
  return {
    id,
    name: `支払先${id}`,
    price,
    item: "外注費",
    period,
    matter_id: 1,
    matters: { id: 1, title: "案件1", team: "チームA", category: "受託案件" },
  };
};

const recurring = (
  start_month: string,
  end_month: string | null,
): Pick<RecurringCostType, "start_month" | "end_month"> => ({
  start_month,
  end_month,
});

describe("isMonthKey", () => {
  it("YYYY-MM 形式（月は01〜12）のみ受け付ける", () => {
    expect(isMonthKey("2026-07")).toBe(true);
    expect(isMonthKey("2026-12")).toBe(true);
    expect(isMonthKey("2026-7")).toBe(false);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-00")).toBe(false);
    expect(isMonthKey("2026-07-01")).toBe(false);
    expect(isMonthKey("")).toBe(false);
  });
});

describe("reportRangeBounds", () => {
  it("単月の範囲は当月1日〜翌月1日", () => {
    expect(
      reportRangeBounds({ startMonth: "2026-07", endMonth: "2026-07" }),
    ).toEqual({ startDate: "2026-07-01", endExclusive: "2026-08-01" });
  });

  it("12月は年をまたいで翌年1月1日を返す", () => {
    expect(
      reportRangeBounds({ startMonth: "2026-12", endMonth: "2026-12" }),
    ).toEqual({ startDate: "2026-12-01", endExclusive: "2027-01-01" });
  });

  it("年度範囲は7月1日〜翌々年7月1日", () => {
    expect(
      reportRangeBounds({ startMonth: "2026-07", endMonth: "2027-06" }),
    ).toEqual({ startDate: "2026-07-01", endExclusive: "2027-07-01" });
  });
});

describe("isDateInRangeOrUndated", () => {
  const bounds = reportRangeBounds({
    startMonth: "2026-07",
    endMonth: "2026-07",
  });

  it("NULL（月未確定）は常に残す", () => {
    expect(isDateInRangeOrUndated(null, bounds)).toBe(true);
  });

  it("期間内は残す（開始日を含む・終了日を含まない）", () => {
    expect(isDateInRangeOrUndated("2026-07-01", bounds)).toBe(true);
    expect(isDateInRangeOrUndated("2026-07-31", bounds)).toBe(true);
    expect(isDateInRangeOrUndated("2026-08-01", bounds)).toBe(false);
  });

  it("期間外は落とす", () => {
    expect(isDateInRangeOrUndated("2026-06-30", bounds)).toBe(false);
    expect(isDateInRangeOrUndated("2027-07-01", bounds)).toBe(false);
  });
});

describe("doesRecurringCostOverlapRange", () => {
  const bounds = reportRangeBounds({
    startMonth: "2026-07",
    endMonth: "2026-07",
  });

  it("適用期間が重なる行は残す（継続中を含む）", () => {
    expect(
      doesRecurringCostOverlapRange(recurring("2026-07-01", null), bounds),
    ).toBe(true);
    expect(
      doesRecurringCostOverlapRange(
        recurring("2025-01-01", "2026-07-01"),
        bounds,
      ),
    ).toBe(true);
  });

  it("適用期間が重ならない行だけを落とす", () => {
    // 取得期間より前に終了
    expect(
      doesRecurringCostOverlapRange(
        recurring("2025-01-01", "2026-06-01"),
        bounds,
      ),
    ).toBe(false);
    // 取得期間より後に開始
    expect(
      doesRecurringCostOverlapRange(recurring("2026-08-01", null), bounds),
    ).toBe(false);
  });
});

describe("isAdjustmentInRange", () => {
  const bounds = reportRangeBounds({
    startMonth: "2026-07",
    endMonth: "2027-06",
  });

  it("対象月が年度範囲内なら残す", () => {
    expect(isAdjustmentInRange("2026-07-01", bounds)).toBe(true);
    expect(isAdjustmentInRange("2027-06-01", bounds)).toBe(true);
  });

  it("対象月が範囲外なら落とす", () => {
    expect(isAdjustmentInRange("2026-06-01", bounds)).toBe(false);
    expect(isAdjustmentInRange("2027-07-01", bounds)).toBe(false);
  });
});

describe("SQL フィルタ文字列（fetchReportSourceRows と同じ定義）", () => {
  it("日付カラムは「期間内 OR NULL」の or() 条件になる", () => {
    const bounds = reportRangeBounds({
      startMonth: "2026-07",
      endMonth: "2026-07",
    });
    expect(datedOrUndatedFilter("invoice_date", bounds)).toBe(
      "and(invoice_date.gte.2026-07-01,invoice_date.lt.2026-08-01),invoice_date.is.null",
    );
    expect(datedOrUndatedFilter("period", bounds)).toBe(
      "and(period.gte.2026-07-01,period.lt.2026-08-01),period.is.null",
    );
  });

  it("定期費用の終了側は「継続中 OR 開始日以降に終了」の or() 条件になる", () => {
    const bounds = reportRangeBounds({
      startMonth: "2026-07",
      endMonth: "2027-06",
    });
    expect(recurringOverlapEndFilter(bounds)).toBe(
      "end_month.gte.2026-07-01,end_month.is.null",
    );
  });
});

describe("期間絞り込みの前後で集計値が変わらない", () => {
  it("月次：対象月外の行を落としても当月レポートが一致する（NULL行は維持）", () => {
    const businessRows = [
      business(500000, "2026-07-31"),
      business(700000, null),
      business(999999, "2026-08-01"),
      business(111111, "2026-06-30"),
    ];
    const costRows = [
      cost(300000, "2026-07-31"),
      cost(200000, null),
      cost(100000, "2026-08-01"),
    ];
    const extraEntries: ExtraEntryType[] = [
      {
        id: 1,
        entry_type: "income",
        category: "協賛金",
        entry_date: "2026-07-10",
        invoice_number: null,
        description: "当月",
        billing_target: null,
        manager_id: 1,
        team: "チームA",
        billing_amount: 120000,
        expense_amount: 20000,
        payment_method: null,
        inserted_at: "2026-07-01T00:00:00+09:00",
        updated_at: "2026-07-01T00:00:00+09:00",
      },
      {
        id: 2,
        entry_type: "income",
        category: "協賛金",
        entry_date: null,
        invoice_number: null,
        description: "月未確定",
        billing_target: null,
        manager_id: 1,
        team: "チームA",
        billing_amount: 90000,
        expense_amount: null,
        payment_method: null,
        inserted_at: "2026-07-01T00:00:00+09:00",
        updated_at: "2026-07-01T00:00:00+09:00",
      },
      {
        id: 3,
        entry_type: "expense",
        category: "交通費",
        entry_date: "2026-08-10",
        invoice_number: null,
        description: "対象外月",
        billing_target: null,
        manager_id: 1,
        team: "チームA",
        billing_amount: null,
        expense_amount: 15000,
        payment_method: "銀行振込",
        inserted_at: "2026-07-01T00:00:00+09:00",
        updated_at: "2026-07-01T00:00:00+09:00",
      },
    ];
    const adjustments: ProfitLossAdjustmentType[] = [
      {
        id: 1,
        target_month: "2026-07-01",
        business_id: businessRows[0].id,
        cost_id: null,
        recurring_cost_id: null,
        adjustment_amount: 20000,
        source_amount_snapshot: 500000,
        reason: "当月調整",
        adjusted_by: 1,
        inserted_at: "2026-07-01T00:00:00+09:00",
        updated_at: "2026-07-01T00:00:00+09:00",
      },
      {
        id: 2,
        target_month: "2026-08-01",
        business_id: businessRows[2].id,
        cost_id: null,
        recurring_cost_id: null,
        adjustment_amount: 5000,
        source_amount_snapshot: 999999,
        reason: "対象外月",
        adjusted_by: 1,
        inserted_at: "2026-07-01T00:00:00+09:00",
        updated_at: "2026-07-01T00:00:00+09:00",
      },
    ];

    const base = {
      month: "2026-07",
      recurringCosts: [] as RecurringCostType[],
      isTeamLeader: false,
      includeTeamBreakdown: true,
      includeOrphanedAdjustments: true,
    };
    const full = buildMonthlyReport({
      ...base,
      businessRows,
      costRows,
      extraEntries,
      adjustments,
    });

    // SQL の WHERE 句と同じ条件でインメモリ絞り込み
    const bounds = reportRangeBounds({
      startMonth: "2026-07",
      endMonth: "2026-07",
    });
    const filtered = buildMonthlyReport({
      ...base,
      businessRows: businessRows.filter((row) =>
        isDateInRangeOrUndated(row.invoice_date, bounds),
      ),
      costRows: costRows.filter((row) =>
        isDateInRangeOrUndated(row.period, bounds),
      ),
      extraEntries: extraEntries.filter((entry) =>
        isDateInRangeOrUndated(entry.entry_date, bounds),
      ),
      adjustments: adjustments.filter((adj) =>
        isAdjustmentInRange(adj.target_month, bounds),
      ),
    });

    expect(filtered).toEqual(full);
    // 月未確定行が脱落していないこと
    expect(filtered.undated).toEqual({ revenue: 790000, matterCost: 200000 });
  });

  it("年間推移：年度範囲で絞っても12ヶ月分のレポートが一致する", () => {
    const businessRows = [
      business(500000, "2026-07-31"),
      business(200000, "2027-06-01"),
      business(999999, "2027-07-01"),
      business(111111, "2026-06-30"),
    ];
    const costRows = [cost(100000, "2026-12-15"), cost(99999, "2028-01-01")];
    // 年度をまたぐ定期費用（四半期・年払い・年度前終了・年度後開始・継続中）
    const recurringCosts: RecurringCostType[] = [
      {
        id: 1,
        name: "四半期費用",
        item: "システム料",
        price: 30000,
        team: "チームA",
        payment_cycle: "quarterly",
        start_month: "2026-07-01",
        end_month: null,
        comment: null,
        inserted_at: "2026-07-01T00:00:00+09:00",
        updated_at: "2026-07-01T00:00:00+09:00",
      },
      {
        id: 2,
        name: "年払い費用",
        item: "広告宣伝費",
        price: 120000,
        team: null,
        payment_cycle: "yearly",
        start_month: "2026-07-01",
        end_month: null,
        comment: null,
        inserted_at: "2026-07-01T00:00:00+09:00",
        updated_at: "2026-07-01T00:00:00+09:00",
      },
      {
        id: 3,
        name: "年度前終了",
        item: "施設利用料",
        price: 50000,
        team: "チームA",
        payment_cycle: "monthly",
        start_month: "2025-01-01",
        end_month: "2026-06-01",
        comment: null,
        inserted_at: "2026-07-01T00:00:00+09:00",
        updated_at: "2026-07-01T00:00:00+09:00",
      },
      {
        id: 4,
        name: "年度後開始",
        item: "施設利用料",
        price: 50000,
        team: "チームA",
        payment_cycle: "monthly",
        start_month: "2027-07-01",
        end_month: null,
        comment: null,
        inserted_at: "2026-07-01T00:00:00+09:00",
        updated_at: "2026-07-01T00:00:00+09:00",
      },
    ];
    const extraEntries: ExtraEntryType[] = [
      {
        id: 11,
        entry_type: "income",
        category: "協賛金",
        entry_date: "2027-01-15",
        invoice_number: null,
        description: "年度内",
        billing_target: null,
        manager_id: 1,
        team: "チームA",
        billing_amount: 100000,
        expense_amount: null,
        payment_method: null,
        inserted_at: "2026-07-01T00:00:00+09:00",
        updated_at: "2026-07-01T00:00:00+09:00",
      },
      {
        id: 12,
        entry_type: "income",
        category: "協賛金",
        entry_date: null,
        invoice_number: null,
        description: "月未確定",
        billing_target: null,
        manager_id: 1,
        team: "チームA",
        billing_amount: 90000,
        expense_amount: null,
        payment_method: null,
        inserted_at: "2026-07-01T00:00:00+09:00",
        updated_at: "2026-07-01T00:00:00+09:00",
      },
      {
        id: 13,
        entry_type: "expense",
        category: "交通費",
        entry_date: "2027-07-10",
        invoice_number: null,
        description: "年度外",
        billing_target: null,
        manager_id: 1,
        team: "チームA",
        billing_amount: null,
        expense_amount: 15000,
        payment_method: "銀行振込",
        inserted_at: "2026-07-01T00:00:00+09:00",
        updated_at: "2026-07-01T00:00:00+09:00",
      },
    ];
    const adjustments: ProfitLossAdjustmentType[] = [
      {
        id: 21,
        target_month: "2026-07-01",
        business_id: businessRows[0].id,
        cost_id: null,
        recurring_cost_id: null,
        adjustment_amount: 20000,
        source_amount_snapshot: 500000,
        reason: "年度内調整",
        adjusted_by: 1,
        inserted_at: "2026-07-01T00:00:00+09:00",
        updated_at: "2026-07-01T00:00:00+09:00",
      },
      {
        id: 22,
        target_month: "2027-07-01",
        business_id: businessRows[2].id,
        cost_id: null,
        recurring_cost_id: null,
        adjustment_amount: 5000,
        source_amount_snapshot: 999999,
        reason: "年度外調整",
        adjusted_by: 1,
        inserted_at: "2026-07-01T00:00:00+09:00",
        updated_at: "2026-07-01T00:00:00+09:00",
      },
    ];
    const bounds = reportRangeBounds({
      startMonth: "2026-07",
      endMonth: "2027-06",
    });
    const filteredBusiness = businessRows.filter((row) =>
      isDateInRangeOrUndated(row.invoice_date, bounds),
    );
    const filteredCosts = costRows.filter((row) =>
      isDateInRangeOrUndated(row.period, bounds),
    );
    // SQL と同じ条件で絞り込む（定期費用は適用期間の重なり、調整は対象月）
    const filteredRecurring = recurringCosts.filter((rc) =>
      doesRecurringCostOverlapRange(rc, bounds),
    );
    const filteredExtra = extraEntries.filter((entry) =>
      isDateInRangeOrUndated(entry.entry_date, bounds),
    );
    const filteredAdjustments = adjustments.filter((adj) =>
      isAdjustmentInRange(adj.target_month, bounds),
    );
    // 年度外の行だけが落ちていること
    expect(filteredRecurring.map((rc) => rc.id).sort()).toEqual([1, 2]);
    expect(filteredExtra.map((entry) => entry.id).sort()).toEqual([11, 12]);
    expect(filteredAdjustments.map((adj) => adj.id)).toEqual([21]);

    const months = fiscalYearMonths(2026);
    expect(months).toHaveLength(12);
    months.forEach((month) => {
      const base = {
        month,
        isTeamLeader: false,
        includeTeamBreakdown: false,
        includeOrphanedAdjustments: false,
      };
      expect(
        buildMonthlyReport({
          ...base,
          businessRows: filteredBusiness,
          costRows: filteredCosts,
          recurringCosts: filteredRecurring,
          extraEntries: filteredExtra,
          adjustments: filteredAdjustments,
        }),
      ).toEqual(
        buildMonthlyReport({
          ...base,
          businessRows,
          costRows,
          recurringCosts,
          extraEntries,
          adjustments,
        }),
      );
    });
  });
});
