"use client";

import { AnnualTrendType } from "@/app/types/types";
import { formatCurrency } from "@/app/utils/formatter";
import {
  AnnualTrendChartDatum,
  formatAxisAmount,
  toAnnualTrendChartData,
} from "@/app/utils/profitLossChart";
import { CompositeChart, CompositeChartSeries } from "@mantine/charts";
// Chart styles are loaded here (this component is lazy-loaded via next/dynamic); applied after @mantine/core styles.
import "@mantine/charts/styles.css";
import { ANNUAL_TREND_CHART_HEIGHT } from "./AnnualTrendChartFrame";

type Props = {
  trend: AnnualTrendType;
};

type SeriesKey = Exclude<keyof AnnualTrendChartDatum, "month" | "monthLabel">;
type Series = CompositeChartSeries & { name: SeriesKey; label: string };

// Series definitions, in the same order as the table rows. Closed months are distinguished by table column color, not in the chart.
const TABLE_ORDER_SERIES: Series[] = [
  { name: "revenue", label: "売上", type: "line", color: "#2a78d6" },
  { name: "matterCost", label: "案件費用", type: "line", color: "#eb6834" },
  { name: "grossProfit", label: "粗利", type: "line", color: "#1baf7a" },
  { name: "adminCost", label: "管理費", type: "line", color: "#eda100" },
  { name: "ordinaryProfit", label: "経常利益", type: "bar", color: "#e87ba4" },
];

// Draw order: the ordinary-profit bar goes first (behind) so it does not hide line points; tooltip follows this order.
const SERIES: Series[] = [
  ...TABLE_ORDER_SERIES.filter((series) => series.type === "bar"),
  ...TABLE_ORDER_SERIES.filter((series) => series.type !== "bar"),
];

// Legend follows table row order, not draw order; Mantine's legend uses only dataKey and color.
const LEGEND_PAYLOAD = TABLE_ORDER_SERIES.map((series) => ({
  id: series.name,
  dataKey: series.name,
  value: series.label,
  color: series.color,
  type: series.type === "bar" ? ("rect" as const) : ("line" as const),
}));

const AnnualTrendChart = ({ trend }: Props) => (
  <CompositeChart
    h={ANNUAL_TREND_CHART_HEIGHT}
    data={toAnnualTrendChartData(trend)}
    dataKey="monthLabel"
    series={SERIES}
    withLegend
    legendProps={{ payload: LEGEND_PAYLOAD }}
    // Left-aligned so the first series is visible without scrolling on mobile.
    styles={{ legend: { justifyContent: "flex-start" } }}
    valueFormatter={formatCurrency}
    yAxisProps={{ tickFormatter: formatAxisAmount, width: 64 }}
    xAxisProps={{ interval: 0 }}
    // Zero baseline; bars for negative ordinary profit extend below it.
    referenceLines={[{ y: 0, color: "gray.6" }]}
    maxBarWidth={28}
    // Straight lines: curve interpolation would draw peaks/valleys that do not exist.
    curveType="linear"
  />
);

export default AnnualTrendChart;
