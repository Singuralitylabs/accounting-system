// @vitest-environment jsdom

import { act, fireEvent, screen } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnnualTrendType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const { chartMounts, chartUnmounts } = vi.hoisted(() => ({
  chartMounts: { count: 0 },
  chartUnmounts: { count: 0 },
}));

const trend: AnnualTrendType = { fiscalYear: 2026, months: [] };

vi.mock("@/app/hooks/useProfitLossData", () => ({
  useProfitLossReport: () => ({
    data: null,
    isLoading: false,
    isError: false,
  }),
  useAnnualTrend: () => ({ data: trend, isLoading: false, isError: false }),
}));
vi.mock("@/app/hooks/useProfitLossClosing", () => ({
  useClosedMonths: () => ({ closedMonths: new Set<string>() }),
  useClosingDiffSummary: () => ({ data: [] }),
}));

vi.mock("@/app/components/profitLoss/ProfitLossStatement", () => ({
  default: () => null,
  DEFAULT_BREAKDOWN_TAB: "matter",
  resolveBreakdownTab: (tab: string) => tab,
}));
vi.mock("@/app/components/profitLoss/ClosingControl", () => ({
  default: () => null,
}));
vi.mock("@/app/components/profitLoss/ClosingDiffBanner", () => ({
  default: () => null,
}));
vi.mock("@/app/components/profitLoss/CopyPreviousExtraEntriesButton", () => ({
  default: () => null,
}));

// Replace only the chart (Recharts) with a stub that counts mounts/unmounts. AnnualTrendChart is loaded
// via next/dynamic, whose dynamic import is not affected by vi.mock, so mock the static import behind it.
vi.mock("@mantine/charts", () => ({
  CompositeChart: () => {
    useEffect(() => {
      chartMounts.count += 1;
      return () => {
        chartUnmounts.count += 1;
      };
    }, []);
    return <div data-testid="annual-trend-chart" />;
  },
}));

import ProfitLossView from "@/app/components/profitLoss/ProfitLossView";

const renderView = () =>
  renderWithMantine(
    <ProfitLossView
      initialMonth="2026-09"
      initialReport={null}
      canEditRecurringCosts={false}
      canEditExtraEntries={false}
      canEditAdjustments={false}
      canEditLabels={false}
      canClose={false}
    />,
  );

describe("ProfitLossView の年間推移グラフ（Issue #177）", () => {
  beforeEach(() => {
    chartMounts.count = 0;
    chartUnmounts.count = 0;
  });

  it("年間推移タブの表示中だけグラフをマウントし、月次タブに戻るとアンマウントする", async () => {
    renderView();

    expect(screen.queryByTestId("annual-trend-chart")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "年間推移" }));
    expect(
      screen.getByRole("status", { name: "読み込み中" }),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("annual-trend-chart")).toBeInTheDocument();
    expect(chartMounts.count).toBe(1);
    expect(screen.queryByRole("status", { name: "読み込み中" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "月次" }));
    expect(screen.queryByTestId("annual-trend-chart")).toBeNull();
    expect(chartUnmounts.count).toBe(1);
    expect(
      screen.getByText("売上・利益の推移（2026年度）"),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "年間推移" }));
    });
    expect(screen.getByTestId("annual-trend-chart")).toBeInTheDocument();
    expect(chartMounts.count).toBe(2);
  });
});
