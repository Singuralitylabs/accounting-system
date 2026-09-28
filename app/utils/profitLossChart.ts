// 損益計算書の年間推移グラフ（Issue #177）用の純粋関数。
// 表（AnnualTrendTable）と同じ AnnualTrendType を、グラフ（@mantine/charts の
// CompositeChart）が受け取る 1 か月 1 要素の配列に変換する。

import { AnnualTrendType } from "../types/types";
import { formatMonthHeader } from "./formatter";

export type AnnualTrendChartDatum = {
  month: string; // "YYYY-MM"
  monthLabel: string; // 横軸の表記（「M月」。表の見出しと同じ）
  revenue: number; // 売上（revenueTotal）
  matterCost: number; // 案件費用（matterCostTotal）
  grossProfit: number; // 粗利（grossProfitTotal）
  adminCost: number; // 管理費（adminCostTotal）
  ordinaryProfit: number; // 経常利益（ordinaryProfit）
};

// 年間推移 → グラフ用の配列。trend.months の順（7 月始まり。表の列と同じ順）を保つ。
// 年度合計はグラフに含めない。マイナスの値（赤字の月）はそのまま残し、0 より下に描く
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

// 縦軸の目盛りの短い表記（1000000 → 「100万」、150000000 → 「1.5億」、-500000 → 「-50万」）。
// ツールチップは表と同じ円表記（formatCurrency）にする
export const formatAxisAmount = (value: number): string =>
  compactYenFormatter.format(value);
