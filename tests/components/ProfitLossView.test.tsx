// @vitest-environment jsdom

import { act, fireEvent, screen } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnnualTrendType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const { chartMounts, chartUnmounts, reportMonths, trendYears } = vi.hoisted(
  () => ({
    chartMounts: { count: 0 },
    chartUnmounts: { count: 0 },
    reportMonths: [] as string[],
    trendYears: [] as number[],
  }),
);

const trend: AnnualTrendType = { fiscalYear: 2026, months: [] };

vi.mock("@/app/hooks/useProfitLossData", () => ({
  useProfitLossReport: (month: string) => {
    reportMonths.push(month);
    return { data: null, isLoading: false, isError: false };
  },
  useAnnualTrend: (fiscalYear: number) => {
    trendYears.push(fiscalYear);
    return { data: trend, isLoading: false, isError: false };
  },
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

describe("ProfitLossView の前後ボタン（Issue #229）", () => {
  beforeEach(() => {
    reportMonths.length = 0;
    trendYears.length = 0;
  });

  it("月次タブで前月・翌月ボタンを押すと該当月のレポートを取得する", () => {
    renderView();
    expect(reportMonths.at(-1)).toBe("2026-09");

    fireEvent.click(screen.getByRole("button", { name: "前月" }));
    expect(reportMonths.at(-1)).toBe("2026-08");

    fireEvent.click(screen.getByRole("button", { name: "翌月" }));
    fireEvent.click(screen.getByRole("button", { name: "翌月" }));
    expect(reportMonths.at(-1)).toBe("2026-10");
  });

  it("年間推移タブで前年度・翌年度ボタンを押すと年度が切り替わり、選択肢の端では無効になる", () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: "年間推移" }));

    // Options run from current fiscal year + 1 (2027) down to 5 years back (2022).
    fireEvent.click(screen.getByRole("button", { name: "翌年度" }));
    expect(trendYears.at(-1)).toBe(2027);
    expect(screen.getByRole("button", { name: "翌年度" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "前年度" }));
    expect(trendYears.at(-1)).toBe(2026);
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "前年度" }));
    }
    expect(trendYears.at(-1)).toBe(2022);
    expect(screen.getByRole("button", { name: "前年度" })).toBeDisabled();
  });
});
