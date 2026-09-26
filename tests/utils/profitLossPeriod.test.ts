import { describe, expect, it } from "vitest";
import {
  BusinessRow,
  CostRow,
  collectMissingAdjustmentTargetIds,
  datedOrUndatedFilter,
  doesRecurringCostOverlapRange,
  fiscalYearMonths,
  groupConsecutiveMonths,
  isAdjustmentInRange,
  isDateInRangeOrUndated,
  isMatterInRangeOrUndated,
  isMonthKey,
  matterPeriodFilter,
  recurringOverlapEndFilter,
  reportRangeBounds,
} from "@/app/utils/profitLossLogic";
import { buildMonthReport } from "@/app/utils/profitLossClosing";
import {
  ExtraEntryType,
  ProfitLossAdjustmentType,
  RecurringCostType,
} from "@/app/types/types";

let nextId = 1;

const business = (
  amount: number | null,
  startDate: string | null,
): BusinessRow => {
  const id = nextId++;
  return {
    id,
    name: `取引先${id}`,
    amount,
    matter_id: 1,
    matters: {
      id: 1,
      user_id: 1,
      title: "案件1",
      team: "チームA",
      category: "受託案件",
      start_date: startDate,
      is_fixed: true,
      is_completed: false,
    },
  };
};

const cost = (price: number, startDate: string | null): CostRow => {
  const id = nextId++;
  return {
    id,
    name: `支払先${id}`,
    price,
    item: "外注費",
    matter_id: 1,
    matters: {
      id: 1,
      user_id: 1,
      title: "案件1",
      team: "チームA",
      category: "受託案件",
      start_date: startDate,
      is_fixed: true,
      is_completed: false,
    },
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

describe("orphanedAdjustments のラベル解決（補完取得）", () => {
  const adjustmentOn = (
    target_month: string,
    target: { business_id: number | null; cost_id: number | null },
  ): ProfitLossAdjustmentType => ({
    id: nextId++,
    target_month,
    business_id: target.business_id,
    cost_id: target.cost_id,
    recurring_cost_id: null,
    adjustment_amount: 10000,
    source_amount_snapshot: 300000,
    reason: "実績額修正",
    adjusted_by: 1,
    inserted_at: "2026-07-01T00:00:00+09:00",
    updated_at: "2026-07-01T00:00:00+09:00",
  });

  it("当月調整の欠けている対象IDだけを集める（他月・取得済みは除外、重複は1件）", () => {
    const julyRow = business(500000, "2026-07-10");
    const movedRow = business(300000, "2026-08-05");
    const julyCost = cost(100000, "2026-07-10");
    const adjustments = [
      adjustmentOn("2026-07-01", {
        business_id: movedRow.id,
        cost_id: null,
      }),
      adjustmentOn("2026-07-01", {
        business_id: movedRow.id,
        cost_id: null,
      }),
      adjustmentOn("2026-07-01", { business_id: null, cost_id: julyCost.id }),
      // 対象月が当月でない調整は集計対象外のため集めない
      adjustmentOn("2026-08-01", {
        business_id: movedRow.id,
        cost_id: null,
      }),
    ];
    expect(
      collectMissingAdjustmentTargetIds(
        "2026-07",
        adjustments,
        new Set([julyRow.id]),
        new Set([julyCost.id]),
        new Set([7]),
      ),
    ).toEqual({
      businessIds: [movedRow.id],
      costIds: [],
      recurringCostIds: [],
    });
  });

  it("補完行を追加しても集計値は変わらずラベルが解決される", () => {
    // レビュー指摘の再現手順：2026-07 の business 行に調整を入れる →
    // invoice_date を 2026-08 に変更 → 2026-07 の月次を開く
    const monthlyRow = business(500000, "2026-07-10");
    const movedRow = business(300000, "2026-08-05");
    const adjustments = [
      adjustmentOn("2026-07-01", {
        business_id: movedRow.id,
        cost_id: null,
      }),
    ];
    const base = {
      month: "2026-07",
      costRows: [] as CostRow[],
      recurringCosts: [] as RecurringCostType[],
      extraEntries: [] as ExtraEntryType[],
      isTeamLeader: false,
      includeTeamBreakdown: true,
      includeMonthlyDetails: true,
    };
    // 期間絞り込みで対象行が落ちた状態：ラベルは汎用表示に落ちる
    const withoutSupplement = buildMonthReport({
      ...base,
      businessRows: [monthlyRow],
      adjustments,
    });
    expect(withoutSupplement.orphanedAdjustments).toHaveLength(1);
    expect(withoutSupplement.orphanedAdjustments?.[0].label).toBe(
      `売上（ID: ${movedRow.id}）`,
    );

    // 補完取得を模擬：欠けている ID を集めて対象行を追加する
    const missing = collectMissingAdjustmentTargetIds(
      "2026-07",
      adjustments,
      new Set([monthlyRow.id]),
      new Set(),
      new Set(),
    );
    expect(missing.businessIds).toEqual([movedRow.id]);
    const withSupplement = buildMonthReport({
      ...base,
      businessRows: [monthlyRow, movedRow],
      adjustments,
    });
    expect(withSupplement.orphanedAdjustments?.[0]).toMatchObject({
      targetType: "business",
      label: `${movedRow.matters.title} - ${movedRow.name}`,
    });

    // 集計値は不変（orphanedAdjustments のラベル以外が一致）
    expect(withSupplement.revenueTotal).toBe(withoutSupplement.revenueTotal);
    expect(withSupplement.matterCostTotal).toBe(
      withoutSupplement.matterCostTotal,
    );
    expect(withSupplement.grossProfitTotal).toBe(
      withoutSupplement.grossProfitTotal,
    );
    expect(withSupplement.recurringCostTotal).toBe(
      withoutSupplement.recurringCostTotal,
    );
    expect(withSupplement.ordinaryProfit).toBe(
      withoutSupplement.ordinaryProfit,
    );
    expect(withSupplement.undated).toEqual(withoutSupplement.undated);
    expect(withSupplement.matterBreakdowns).toEqual(
      withoutSupplement.matterBreakdowns,
    );
  });
});

describe("SQL フィルタ文字列（fetchReportSourceRows と同じ定義）", () => {
  it("日付カラムは「期間内 OR NULL」の or() 条件になる", () => {
    const bounds = reportRangeBounds({
      startMonth: "2026-07",
      endMonth: "2026-07",
    });
    expect(datedOrUndatedFilter("entry_date", bounds)).toBe(
      "and(entry_date.gte.2026-07-01,entry_date.lt.2026-08-01),entry_date.is.null",
    );
  });

  it("案件の行は matters 側に「下書きでない AND（開始日が期間内 OR NULL）」の or() 条件になる", () => {
    const bounds = reportRangeBounds({
      startMonth: "2026-07",
      endMonth: "2026-07",
    });
    expect(matterPeriodFilter(bounds)).toBe(
      "and(or(is_fixed.is.true,is_completed.is.true),start_date.gte.2026-07-01,start_date.lt.2026-08-01),and(or(is_fixed.is.true,is_completed.is.true),start_date.is.null)",
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
      includeMonthlyDetails: true,
    };
    const full = buildMonthReport({
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
    const filtered = buildMonthReport({
      ...base,
      businessRows: businessRows.filter((row) =>
        isMatterInRangeOrUndated(row.matters, bounds),
      ),
      costRows: costRows.filter((row) =>
        isMatterInRangeOrUndated(row.matters, bounds),
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
      isMatterInRangeOrUndated(row.matters, bounds),
    );
    const filteredCosts = costRows.filter((row) =>
      isMatterInRangeOrUndated(row.matters, bounds),
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
        includeMonthlyDetails: false,
      };
      expect(
        buildMonthReport({
          ...base,
          businessRows: filteredBusiness,
          costRows: filteredCosts,
          recurringCosts: filteredRecurring,
          extraEntries: filteredExtra,
          adjustments: filteredAdjustments,
        }),
      ).toEqual(
        buildMonthReport({
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

describe("groupConsecutiveMonths", () => {
  it("連続する月を 1 つの取得期間にまとめ、離れた月は別の期間にする（年跨ぎも連続扱い）", () => {
    expect(
      groupConsecutiveMonths(["2026-11", "2026-12", "2027-01", "2027-06"]),
    ).toEqual([
      { startMonth: "2026-11", endMonth: "2027-01" },
      { startMonth: "2027-06", endMonth: "2027-06" },
    ]);
    expect(groupConsecutiveMonths([])).toEqual([]);
  });
});
