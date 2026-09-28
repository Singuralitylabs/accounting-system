// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AnnualTrendChart from "@/app/components/profitLoss/AnnualTrendChart";
import { AnnualTrendType, PLReportType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const monthReport = (month: string, ordinaryProfit: number): PLReportType => ({
  month,
  revenueTotal: 1000000,
  matterCostTotal: 300000,
  grossProfitTotal: 700000,
  matterBreakdowns: [],
  matterTotals: { revenue: 0, cost: 0, grossProfit: 0 },
  categoryBreakdown: [],
  extraIncome: { revenue: 0, cost: 0, grossProfit: 0, entries: [] },
  recurringCostTotal: 200000,
  recurringCostByItem: [],
  extraExpense: { total: 0, entries: [] },
  adminCostTotal: 200000,
  ordinaryProfit,
  undated: { revenue: 0, matterCost: 0, adminCost: 0 },
  closing: null,
});

const trend: AnnualTrendType = {
  fiscalYear: 2026,
  months: [
    monthReport("2026-07", 500000),
    monthReport("2026-08", -300000), // 赤字の月
    monthReport("2026-09", 200000),
  ],
};

// jsdom にはレイアウトが無く ResizeObserver も無い（setup.ts のスタブは何も通知しない）。
// Recharts の ResponsiveContainer は ResizeObserver から受け取った大きさで描くため、
// observe した時点で固定の大きさを通知するモックに差し替える
class SizedResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: { width: 800, height: 320 } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

describe("AnnualTrendChart（Issue #177）", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", SizedResizeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("売上・案件費用・粗利・管理費を折れ線、経常利益を棒で描き、5 系列の凡例を出す", () => {
    const { container } = renderWithMantine(<AnnualTrendChart trend={trend} />);

    expect(
      screen.getByText("売上・利益の推移（2026年度）"),
    ).toBeInTheDocument();
    expect(container.querySelector("svg.recharts-surface")).not.toBeNull();

    // 折れ線 4 本と、経常利益の棒（月ごとに 1 本）
    expect(container.querySelectorAll(".recharts-line")).toHaveLength(4);
    expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(
      3,
    );

    // 凡例
    ["売上", "案件費用", "粗利", "管理費", "経常利益"].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    // 横軸は表の見出しと同じ「M月」
    ["7月", "8月", "9月"].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it("0 の基準線を引き、経常利益がマイナスの月は棒が基準線より下に伸びる", () => {
    const { container } = renderWithMantine(<AnnualTrendChart trend={trend} />);

    const referenceLine = container.querySelector(
      ".recharts-reference-line-line",
    );
    expect(referenceLine).not.toBeNull();
    const zeroY = Number(referenceLine!.getAttribute("y1"));

    const bars = Array.from(
      container.querySelectorAll(".recharts-bar-rectangle path"),
    );
    expect(bars).toHaveLength(3);
    const barExtent = (bar: Element) => {
      const y = Number(bar.getAttribute("y"));
      const height = Number(bar.getAttribute("height"));
      return { top: Math.min(y, y + height), bottom: Math.max(y, y + height) };
    };
    // 黒字の月（7 月・9 月）は基準線より上、赤字の月（8 月）は基準線より下
    expect(barExtent(bars[0]).bottom).toBeCloseTo(zeroY);
    expect(barExtent(bars[1]).top).toBeCloseTo(zeroY);
    expect(barExtent(bars[1]).bottom).toBeGreaterThan(zeroY);
    expect(barExtent(bars[2]).bottom).toBeCloseTo(zeroY);
  });

  it("モバイル幅でも潰れないよう横スクロールの枠に入れ、最小幅を確保する", () => {
    const { container } = renderWithMantine(<AnnualTrendChart trend={trend} />);
    const scrollFrame = container.querySelector(".overflow-x-auto");
    expect(scrollFrame).not.toBeNull();
    expect(scrollFrame!.querySelector(".min-w-\\[720px\\]")).not.toBeNull();
  });
});
