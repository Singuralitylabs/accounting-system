"use client";

import { Loader, Paper, Text } from "@mantine/core";
import { ReactNode } from "react";

// Frame kept in the initial bundle so the placeholder renders at the loaded size without loading Recharts (the chart itself is lazy-loaded).

// Chart height in px including the legend; the placeholder uses the same to avoid layout shift.
export const ANNUAL_TREND_CHART_HEIGHT = 320;

// Minimum width keeping 12 months of ticks and bars readable on mobile; narrower screens scroll horizontally like the table.
export const ANNUAL_TREND_CHART_MIN_WIDTH_CLASS = "min-w-[720px]";

type Props = {
  fiscalYear: number;
  children: ReactNode;
};

const AnnualTrendChartFrame = ({ fiscalYear, children }: Props) => (
  <Paper withBorder radius="md" pt="md" className="mt-4">
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
