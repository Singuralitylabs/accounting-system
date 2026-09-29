// Converts AnnualTrendType into one element per month for the @mantine/charts CompositeChart.

import { AnnualTrendType } from "../types/types";
import { formatMonthHeader } from "./formatter";

export type AnnualTrendChartDatum = {
  month: string; // "YYYY-MM"
  monthLabel: string;
  revenue: number;
  matterCost: number;
  grossProfit: number;
  adminCost: number;
  ordinaryProfit: number;
};

// Keeps trend.months order (July start); no fiscal-year total. Negative months stay negative.
export const toAnnualTrendChartData = (
  trend: AnnualTrendType,
): AnnualTrendChartDatum[] =>
  trend.months.map((month) => ({
    month: month.month,
    monthLabel: formatMonthHeader(month.month),
    revenue: month.revenueTotal,
    matterCost: month.matterCostTotal,
    grossProfit: month.grossProfitTotal,
    adminCost: month.adminCostTotal,
    ordinaryProfit: month.ordinaryProfit,
  }));

const compactYenFormatter = new Intl.NumberFormat("ja-JP", {
  notation: "compact",
  maximumFractionDigits: 1,
});

// Compact axis labels (e.g. 1000000 -> 「100万」, 150000000 -> 「1.5億」); tooltips use formatCurrency.
export const formatAxisAmount = (value: number): string =>
  compactYenFormatter.format(value);
