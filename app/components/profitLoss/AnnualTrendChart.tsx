"use client";

import { AnnualTrendType } from "@/app/types/types";
import { formatCurrency } from "@/app/utils/formatter";
import {
  AnnualTrendChartDatum,
  formatAxisAmount,
  toAnnualTrendChartData,
} from "@/app/utils/profitLossChart";
import { CompositeChart, CompositeChartSeries } from "@mantine/charts";
import { Paper, Text } from "@mantine/core";

type Props = {
  trend: AnnualTrendType;
};

type SeriesKey = Exclude<keyof AnnualTrendChartDatum, "month" | "monthLabel">;

// 系列の定義（Issue #177）。色は色覚の違いでも隣り合う系列を見分けられる組み合わせ。
// 経常利益の棒は折れ線の点を隠さないよう先に（背面に）描くため、配列の先頭に置く
// （凡例・ツールチップもこの順になる）。確定済みの月は表の列の色で区別しているため、
// グラフでは区別しない
const SERIES: (CompositeChartSeries & { name: SeriesKey })[] = [
  { name: "ordinaryProfit", label: "経常利益", type: "bar", color: "#e87ba4" },
  { name: "revenue", label: "売上", type: "line", color: "#2a78d6" },
  { name: "matterCost", label: "案件費用", type: "line", color: "#eb6834" },
  { name: "grossProfit", label: "粗利", type: "line", color: "#1baf7a" },
  { name: "adminCost", label: "管理費", type: "line", color: "#eda100" },
];

// モバイル幅でも 12 か月分の目盛りと棒が潰れないよう確保する最小幅。
// これより狭い画面では表と同じく横スクロールする
export const ANNUAL_TREND_CHART_MIN_WIDTH_CLASS = "min-w-[720px]";

const AnnualTrendChart = ({ trend }: Props) => {
  const data = toAnnualTrendChartData(trend);

  return (
    <Paper withBorder radius="md" pt="md" className="mt-4">
      {/* 見出しは横スクロールの外に置き、スクロール位置に関わらず見えるようにする */}
      <Text fw={700} size="sm" px="md">
        売上・利益の推移（{trend.fiscalYear}年度）
      </Text>
      <div className="overflow-x-auto">
        <div className={`${ANNUAL_TREND_CHART_MIN_WIDTH_CLASS} p-4`}>
          <CompositeChart
            h={320}
            data={data}
            dataKey="monthLabel"
            series={SERIES}
            withLegend
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
        </div>
      </div>
    </Paper>
  );
};

export default AnnualTrendChart;
