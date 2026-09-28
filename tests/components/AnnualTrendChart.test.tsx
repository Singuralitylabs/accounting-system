// @vitest-environment jsdom

import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AnnualTrendChart from "@/app/components/profitLoss/AnnualTrendChart";
import AnnualTrendChartFrame, {
  ANNUAL_TREND_CHART_HEIGHT,
  ANNUAL_TREND_CHART_MIN_WIDTH_CLASS,
  AnnualTrendChartPlaceholder,
} from "@/app/components/profitLoss/AnnualTrendChartFrame";
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

  it("売上・案件費用・粗利・管理費を折れ線、経常利益を棒で描き、5 系列の凡例を表の行と同じ順に出す", () => {
    const { container } = renderWithMantine(<AnnualTrendChart trend={trend} />);

    expect(container.querySelector("svg.recharts-surface")).not.toBeNull();

    // 折れ線 4 本と、経常利益の棒（月ごとに 1 本）
    expect(container.querySelectorAll(".recharts-line")).toHaveLength(4);
    expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(
      3,
    );

    // 凡例は描画順（棒を背面に描くため経常利益が先）ではなく表の行と同じ順
    const legendNames = Array.from(
      container.querySelectorAll(".mantine-ChartLegend-legendItemName"),
    ).map((item) => item.textContent);
    expect(legendNames).toEqual([
      "売上",
      "案件費用",
      "粗利",
      "管理費",
      "経常利益",
    ]);

    // 横軸は表の見出しと同じ「M月」
    ["7月", "8月", "9月"].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it("凡例にカーソルを合わせるとその系列以外が薄くなり、外すと元に戻る", () => {
    const { container } = renderWithMantine(<AnnualTrendChart trend={trend} />);

    // 折れ線は色で系列を見分ける（AnnualTrendChart の系列定義の色）
    const lineOpacities = () =>
      Object.fromEntries(
        Array.from(container.querySelectorAll("path.recharts-line-curve")).map(
          (path) => [
            path.getAttribute("stroke"),
            path.getAttribute("stroke-opacity"),
          ],
        ),
      );
    const barOpacities = () =>
      Array.from(
        container.querySelectorAll(".recharts-bar-rectangle path"),
      ).map((bar) => bar.getAttribute("fill-opacity"));
    const legendItem = (name: string) =>
      Array.from(
        container.querySelectorAll(".mantine-ChartLegend-legendItem"),
      ).find((item) => item.textContent === name)!;

    const notDimmed = {
      "#2a78d6": "1",
      "#eb6834": "1",
      "#1baf7a": "1",
      "#eda100": "1",
    };
    expect(lineOpacities()).toEqual(notDimmed);
    expect(barOpacities()).toEqual(["1", "1", "1"]);

    // 凡例の payload の dataKey が系列名と一致していないと、どの系列も強調されない
    fireEvent.mouseEnter(legendItem("粗利"));
    expect(lineOpacities()).toEqual({
      "#2a78d6": "0.5",
      "#eb6834": "0.5",
      "#1baf7a": "1", // 粗利だけ元の濃さ
      "#eda100": "0.5",
    });
    expect(barOpacities()).toEqual(["0.1", "0.1", "0.1"]);

    fireEvent.mouseLeave(legendItem("粗利"));
    expect(lineOpacities()).toEqual(notDimmed);
    expect(barOpacities()).toEqual(["1", "1", "1"]);

    // 棒（経常利益）の凡例では、棒が元の濃さのまま折れ線が薄くなる
    fireEvent.mouseEnter(legendItem("経常利益"));
    expect(barOpacities()).toEqual(["1", "1", "1"]);
    expect(Object.values(lineOpacities())).toEqual([
      "0.5",
      "0.5",
      "0.5",
      "0.5",
    ]);
  });

  it("縦軸の目盛りは「万」の短い表記にする", () => {
    const { container } = renderWithMantine(<AnnualTrendChart trend={trend} />);
    const ticks = Array.from(
      container.querySelectorAll(
        ".recharts-yAxis .recharts-cartesian-axis-tick-value",
      ),
    )
      .map((tick) => tick.textContent ?? "")
      .filter((text) => text !== "");
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks).toContain("0");
    // 0 以外の目盛りはすべて「万」表記（円表記・桁区切りの生の数値にしない）
    ticks
      .filter((text) => text !== "0")
      .forEach((text) => expect(text).toMatch(/^-?\d+(\.\d)?万$/));
  });

  it("ツールチップは表と同じ円表記で月の値を出す", () => {
    const { container } = renderWithMantine(<AnnualTrendChart trend={trend} />);
    const wrapper = container.querySelector(".recharts-wrapper")!;
    // 8 月（3 か月のうち中央）の位置にカーソルを合わせる
    fireEvent.mouseMove(wrapper, { clientX: 400, clientY: 150 });

    const tooltip = container.querySelector(".mantine-ChartTooltip-tooltip");
    expect(tooltip).not.toBeNull();
    const text = tooltip!.textContent ?? "";
    expect(text).toContain("8月");
    expect(text).toContain("-￥300,000"); // 経常利益（赤字）
    expect(text).toContain("￥1,000,000"); // 売上
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
});

describe("AnnualTrendChartFrame（Issue #177）", () => {
  it("見出しを出し、モバイル幅でも潰れないよう横スクロールの枠に入れて最小幅を確保する", () => {
    const { container } = renderWithMantine(
      <AnnualTrendChartFrame fiscalYear={2026}>
        <div data-testid="chart" />
      </AnnualTrendChartFrame>,
    );
    expect(
      screen.getByText("売上・利益の推移（2026年度）"),
    ).toBeInTheDocument();
    const scrollFrame = container.querySelector(".overflow-x-auto");
    expect(scrollFrame).not.toBeNull();
    // 見出しはスクロールの外、グラフは最小幅を持つ中身の中
    expect(scrollFrame).not.toHaveTextContent("売上・利益の推移");
    const minWidthBox = scrollFrame!.querySelector(
      `.${CSS.escape(ANNUAL_TREND_CHART_MIN_WIDTH_CLASS)}`,
    );
    expect(minWidthBox).not.toBeNull();
    expect(
      within(minWidthBox as HTMLElement).getByTestId("chart"),
    ).toBeInTheDocument();
  });

  it("読み込み中のプレースホルダーはグラフ本体と同じ高さにする", () => {
    renderWithMantine(<AnnualTrendChartPlaceholder />);
    expect(screen.getByRole("status", { name: "読み込み中" })).toHaveStyle({
      height: `${ANNUAL_TREND_CHART_HEIGHT}px`,
    });
  });
});
