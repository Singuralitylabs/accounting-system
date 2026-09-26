// @vitest-environment jsdom

import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TeamProfitTable from "@/app/components/profitLoss/TeamProfitTable";
import { renderWithMantine } from "../testUtils/renderWithMantine";

describe("TeamProfitTable", () => {
  it("チームごとに売上・案件費用・粗利・管理費・経常利益を表示する（Issue #152）", () => {
    renderWithMantine(
      <TeamProfitTable
        byTeam={[
          {
            team: "シンラボ",
            revenue: 500000,
            matterCost: 100000,
            grossProfit: 400000,
            recurringCost: 30000,
            profit: 370000,
          },
          {
            team: "全体共通",
            revenue: 0,
            matterCost: 0,
            grossProfit: 0,
            recurringCost: 50000,
            profit: -50000,
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("columnheader", { name: "チーム別収支" }),
    ).toBeInTheDocument();
    const teamRow = screen.getByText("シンラボ").closest("tr")!;
    expect(within(teamRow).getByText("￥500,000")).toBeInTheDocument();
    expect(within(teamRow).getByText("￥100,000")).toBeInTheDocument();
    expect(within(teamRow).getByText("￥400,000")).toBeInTheDocument();
    expect(within(teamRow).getByText("￥30,000")).toBeInTheDocument();
    expect(within(teamRow).getByText("￥370,000")).toBeInTheDocument();
    const commonRow = screen.getByText("全体共通").closest("tr")!;
    expect(within(commonRow).getByText("-￥50,000")).toHaveClass(
      "text-red-600",
    );
  });

  it("収支が無い月は表の代わりに案内を表示する", () => {
    renderWithMantine(<TeamProfitTable byTeam={[]} />);
    expect(
      screen.getByText("この月に計上される収支はありません。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
