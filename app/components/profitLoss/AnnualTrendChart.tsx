"use client";

import { AnnualTrendType } from "@/app/types/types";
import { formatCurrency } from "@/app/utils/formatter";
import {
  AnnualTrendChartDatum,
  formatAxisAmount,
  toAnnualTrendChartData,
} from "@/app/utils/profitLossChart";
import { CompositeChart, CompositeChartSeries } from "@mantine/charts";
// グラフのスタイルは全ページ共通の layout ではなくここで読み込む（このコンポーネントは
// next/dynamic で遅延読み込みされるため、/profit-loss の年間推移を開いたときだけ読み込まれる）。
// @mantine/core のスタイル（layout で読み込み済み）より後に適用される
import "@mantine/charts/styles.css";
import { ANNUAL_TREND_CHART_HEIGHT } from "./AnnualTrendChartFrame";

type Props = {
  trend: AnnualTrendType;
};

type SeriesKey = Exclude<keyof AnnualTrendChartDatum, "month" | "monthLabel">;
type Series = CompositeChartSeries & { name: SeriesKey; label: string };

// 系列の定義（Issue #177）。表の行と同じ順。色は色覚の違いでも隣り合う系列を
// 見分けられる組み合わせ。確定済みの月は表の列の色で区別しているため、
// グラフでは区別しない
const TABLE_ORDER_SERIES: Series[] = [
  { name: "revenue", label: "売上", type: "line", color: "#2a78d6" },
  { name: "matterCost", label: "案件費用", type: "line", color: "#eb6834" },
  { name: "grossProfit", label: "粗利", type: "line", color: "#1baf7a" },
  { name: "adminCost", label: "管理費", type: "line", color: "#eda100" },
  { name: "ordinaryProfit", label: "経常利益", type: "bar", color: "#e87ba4" },
];

// 描画順。経常利益の棒は折れ線の点を隠さないよう先に（背面に）描く
// （ツールチップもこの順になる）
const SERIES: Series[] = [
  ...TABLE_ORDER_SERIES.filter((series) => series.type === "bar"),
  ...TABLE_ORDER_SERIES.filter((series) => series.type !== "bar"),
];

// 凡例は描画順ではなく表の行と同じ順に並べる。Mantine の凡例は各要素の
// dataKey（系列名）と color だけを使う
const LEGEND_PAYLOAD = TABLE_ORDER_SERIES.map((series) => ({
  id: series.name,
  dataKey: series.name,
  value: series.label,
  color: series.color,
  type: series.type === "bar" ? ("rect" as const) : ("line" as const),
}));

// 枠（見出し・横スクロール・最小幅）は AnnualTrendChartFrame が持つ
const AnnualTrendChart = ({ trend }: Props) => (
  <CompositeChart
    h={ANNUAL_TREND_CHART_HEIGHT}
    data={toAnnualTrendChartData(trend)}
    dataKey="monthLabel"
    series={SERIES}
    withLegend
    legendProps={{ payload: LEGEND_PAYLOAD }}
    // 凡例は左寄せにし、モバイル幅でもスクロールせずに先頭の系列から見えるようにする
    styles={{ legend: { justifyContent: "flex-start" } }}
    // ツールチップは表と同じ円表記、縦軸の目盛りは「100万」のように短く表記する
    valueFormatter={formatCurrency}
    yAxisProps={{ tickFormatter: formatAxisAmount, width: 64 }}
    // 12 か月分の見出しを間引かずに出す
    xAxisProps={{ interval: 0 }}
    // 0 の基準線。経常利益がマイナスの月は棒がこの線より下に伸びる
    referenceLines={[{ y: 0, color: "gray.6" }]}
    maxBarWidth={28}
    // 月の値の間は直線で結ぶ（曲線で補間すると実在しない山や谷が描かれるため）
    curveType="linear"
  />
);

export default AnnualTrendChart;
