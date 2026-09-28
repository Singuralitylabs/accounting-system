"use client";

import { Loader, Paper, Text } from "@mantine/core";
import { ReactNode } from "react";

// 年間推移グラフ（Issue #177）の枠。グラフ本体（AnnualTrendChart）は Recharts を含み
// 遅延読み込みするため、枠と読み込み中のプレースホルダーはこのファイルに分けて
// 初期バンドルに置く（Recharts を読み込まずに、読み込み後と同じ大きさで表示できる）

// グラフ本体の高さ（px。凡例を含む）。読み込み中のプレースホルダーも同じ高さにし、
// 読み込み完了時にレイアウトがずれないようにする
export const ANNUAL_TREND_CHART_HEIGHT = 320;

// モバイル幅でも 12 か月分の目盛りと棒が潰れないよう確保する最小幅。
// これより狭い画面では表と同じく横スクロールする
export const ANNUAL_TREND_CHART_MIN_WIDTH_CLASS = "min-w-[720px]";

type Props = {
  fiscalYear: number;
  children: ReactNode;
};

const AnnualTrendChartFrame = ({ fiscalYear, children }: Props) => (
  <Paper withBorder radius="md" pt="md" className="mt-4">
    {/* 見出しは横スクロールの外に置き、スクロール位置に関わらず見えるようにする */}
    <Text fw={700} size="sm" px="md">
      売上・利益の推移（{fiscalYear}年度）
    </Text>
    <div className="overflow-x-auto">
      <div className={`${ANNUAL_TREND_CHART_MIN_WIDTH_CLASS} p-4`}>
        {children}
      </div>
    </div>
  </Paper>
);

// グラフ本体の読み込み中（next/dynamic の loading）に枠の中へ表示する
export const AnnualTrendChartPlaceholder = () => (
  <div
    className="flex items-center justify-center"
    style={{ height: ANNUAL_TREND_CHART_HEIGHT }}
    role="status"
    aria-label="読み込み中"
  >
    <Loader />
  </div>
);

export default AnnualTrendChartFrame;
