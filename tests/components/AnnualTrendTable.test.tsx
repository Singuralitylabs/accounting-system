// @vitest-environment jsdom

import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AnnualTrendTable, {
  CLOSED_MONTH_COLUMN_CLASS,
} from "@/app/components/profitLoss/AnnualTrendTable";
import { AnnualTrendType, PLReportType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const monthReport = (month: string, closed: boolean): PLReportType => ({
  month,
  revenueTotal: 100000,
  matterCostTotal: 30000,
  grossProfitTotal: 70000,
  matterBreakdowns: [],
  categoryBreakdown: [],
  recurringCostTotal: 20000,
  recurringCostByItem: [],
  extraEntries: [],
  ordinaryProfit: 50000,
  undated: { revenue: 0, matterCost: 0 },
  closing: closed
    ? {
        month,
        closedAt: "2026-09-01T10:00:00+09:00",
        closedByName: "経理太郎",
        refreshedAt: null,
        refreshedByName: null,
      }
    : null,
});

const trend = (closedMonths: string[]): AnnualTrendType => ({
  fiscalYear: 2026,
  months: ["2026-07", "2026-08", "2026-09"].map((month) =>
    monthReport(month, closedMonths.includes(month)),
  ),
});

describe("AnnualTrendTable（Issue #152）", () => {
  it("確定済みの月の列（見出しと各行のセル）だけ背景色を変え、凡例を出す", () => {
    renderWithMantine(<AnnualTrendTable trend={trend(["2026-08"])} />);

    expect(
      screen.getByText("色付きの列は確定済みの月（確定値を表示）です"),
    ).toBeInTheDocument();

    const headers = screen.getAllByRole("columnheader");
    const closedHeaders = headers.filter((header) =>
      header.classList.contains(CLOSED_MONTH_COLUMN_CLASS),
    );
    expect(closedHeaders).toHaveLength(1);
    expect(closedHeaders[0]).toHaveTextContent("8月");
    // 確定済みの鍵アイコンも残す
    expect(
      within(closedHeaders[0]).getByRole("img", { name: "確定済み" }),
    ).toBeInTheDocument();

    // 各行（売上〜経常利益の 5 行）の 8 月のセルだけが色付き
    const monthIndex = headers.indexOf(closedHeaders[0]);
    const bodyRows = screen.getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(5);
    bodyRows.forEach((row) => {
      const cells = within(row).getAllByRole("cell");
      cells.forEach((cell, index) => {
        expect(cell.classList.contains(CLOSED_MONTH_COLUMN_CLASS)).toBe(
          index === monthIndex,
        );
      });
    });
  });

  it("確定済みの月が無ければ凡例を出さず、どの列も色付けしない", () => {
    renderWithMantine(<AnnualTrendTable trend={trend([])} />);
    expect(
      screen.queryByText("色付きの列は確定済みの月（確定値を表示）です"),
    ).not.toBeInTheDocument();
    expect(
      document.querySelectorAll(`.${CLOSED_MONTH_COLUMN_CLASS}`),
    ).toHaveLength(0);
  });
});
