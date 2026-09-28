import { describe, expect, it } from "vitest";
import {
  formatAxisAmount,
  toAnnualTrendChartData,
} from "@/app/utils/profitLossChart";
import { AnnualTrendType, PLReportType } from "@/app/types/types";

// 月ごとに値を変えた損益（index で値をずらし、系列・月の取り違えを検出できるようにする）
const monthReport = (month: string, index: number): PLReportType => ({
  month,
  revenueTotal: 1000000 + index,
  matterCostTotal: 300000 + index,
  grossProfitTotal: 700000 + index,
  matterBreakdowns: [],
  matterTotals: { revenue: 0, cost: 0, grossProfit: 0 },
  categoryBreakdown: [],
  extraIncome: { revenue: 0, cost: 0, grossProfit: 0, entries: [] },
  recurringCostTotal: 150000 + index,
  recurringCostByItem: [],
  extraExpense: { total: 50000, entries: [] },
  adminCostTotal: 200000 + index,
  ordinaryProfit: 500000 + index,
  undated: { revenue: 0, matterCost: 0, adminCost: 0 },
  closing: null,
});

// 2026 年度（2026/7〜2027/6）の 12 か月
const FISCAL_2026_MONTHS = [
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
  "2026-11",
  "2026-12",
  "2027-01",
  "2027-02",
  "2027-03",
  "2027-04",
  "2027-05",
  "2027-06",
];

const trend = (): AnnualTrendType => ({
  fiscalYear: 2026,
  months: FISCAL_2026_MONTHS.map((month, index) => monthReport(month, index)),
});

describe("toAnnualTrendChartData（Issue #177）", () => {
  it("12 か月分を 7 月〜6 月の順に変換し、横軸は表の見出しと同じ「M月」にする", () => {
    const data = toAnnualTrendChartData(trend());
    expect(data).toHaveLength(12);
    expect(data.map((d) => d.month)).toEqual(FISCAL_2026_MONTHS);
    expect(data.map((d) => d.monthLabel)).toEqual([
      "7月",
      "8月",
      "9月",
      "10月",
      "11月",
      "12月",
      "1月",
      "2月",
      "3月",
      "4月",
      "5月",
      "6月",
    ]);
  });

  it("各系列の値は PLReportType の該当項目と一致する（年度合計は含めない）", () => {
    const source = trend();
    const data = toAnnualTrendChartData(source);
    data.forEach((datum, index) => {
      const report = source.months[index];
      expect(datum).toEqual({
        month: report.month,
        monthLabel: datum.monthLabel,
        revenue: report.revenueTotal,
        matterCost: report.matterCostTotal,
        grossProfit: report.grossProfitTotal,
        adminCost: report.adminCostTotal,
        ordinaryProfit: report.ordinaryProfit,
      });
    });
  });

  it("マイナスの値（赤字の月）はそのまま残す", () => {
    const source: AnnualTrendType = {
      fiscalYear: 2026,
      months: [
        {
          ...monthReport("2026-07", 0),
          revenueTotal: 100000,
          matterCostTotal: 250000,
          grossProfitTotal: -150000,
          adminCostTotal: 200000,
          ordinaryProfit: -350000,
        },
      ],
    };
    const [datum] = toAnnualTrendChartData(source);
    expect(datum.grossProfit).toBe(-150000);
    expect(datum.ordinaryProfit).toBe(-350000);
  });

  it("月が無ければ空配列を返す", () => {
    expect(toAnnualTrendChartData({ fiscalYear: 2026, months: [] })).toEqual(
      [],
    );
  });
});

describe("formatAxisAmount（Issue #177）", () => {
  it("縦軸の目盛りを万・億の短い表記にする（マイナスは符号を残す）", () => {
    expect(formatAxisAmount(0)).toBe("0");
    expect(formatAxisAmount(5000)).toBe("5000");
    expect(formatAxisAmount(250000)).toBe("25万");
    expect(formatAxisAmount(1000000)).toBe("100万");
    expect(formatAxisAmount(-500000)).toBe("-50万");
    expect(formatAxisAmount(150000000)).toBe("1.5億");
  });
});
