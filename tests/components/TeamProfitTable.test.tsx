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
            adminCost: 30000,
            profit: 370000,
          },
          {
            team: "全体共通",
            revenue: 0,
            matterCost: 0,
            grossProfit: 0,
            adminCost: 50000,
            profit: -50000,
          },
        ]}
      />,
    );
    expect(screen.getByTestId("team-profit-card-list")).toHaveClass(
      "md:hidden",
    );
    const tableWrap = screen.getByRole("table").parentElement?.parentElement;
    expect(tableWrap).toHaveClass("hidden", "md:block");
    expect(tableWrap?.className ?? "").not.toContain("overflow-x-auto");
    expect(
      screen.getByRole("columnheader", { name: "チーム別収支" }),
    ).toBeInTheDocument();
    const teamRow = within(screen.getByRole("table"))
      .getByText("シンラボ")
      .closest("tr")!;
    expect(within(teamRow).getByText("￥500,000")).toBeInTheDocument();
    expect(within(teamRow).getByText("￥100,000")).toBeInTheDocument();
    expect(within(teamRow).getByText("￥400,000")).toBeInTheDocument();
    expect(within(teamRow).getByText("￥30,000")).toBeInTheDocument();
    expect(within(teamRow).getByText("￥370,000")).toBeInTheDocument();
    const commonRow = within(screen.getByRole("table"))
      .getByText("全体共通")
      .closest("tr")!;
    expect(within(commonRow).getByText("-￥50,000")).toHaveClass(
      "text-red-600",
    );
  });

  it("モバイルのカードに 5 つの金額と色を出し、経常利益は区切り線の下で太字にする（Issue #235）", () => {
    renderWithMantine(
      <TeamProfitTable
        byTeam={[
          {
            team: "シンラボ",
            revenue: 500000,
            matterCost: 100000,
            grossProfit: 400000,
            adminCost: 30000,
            profit: 370000,
          },
          {
            team: "全体共通",
            revenue: 0,
            matterCost: 0,
            grossProfit: 0,
            adminCost: 50000,
            profit: -50000,
          },
        ]}
      />,
    );
    const list = within(screen.getByTestId("team-profit-card-list"));
    const labCard = list.getByText("シンラボ").parentElement!;
    expect(within(labCard).getByText("売上：")).toBeInTheDocument();
    expect(within(labCard).getByText("案件費用：")).toBeInTheDocument();
    expect(within(labCard).getByText("粗利：")).toBeInTheDocument();
    expect(within(labCard).getByText("管理費：")).toBeInTheDocument();
    expect(within(labCard).getByText("￥500,000")).toBeInTheDocument();
    expect(within(labCard).getByText("￥100,000")).toBeInTheDocument();
    expect(within(labCard).getByText("￥400,000")).toHaveClass(
      "text-green-700",
    );
    expect(within(labCard).getByText("￥30,000")).toBeInTheDocument();
    const profit = within(labCard).getByText("￥370,000");
    expect(profit).toHaveClass("text-green-700");
    expect(profit).toHaveClass("font-bold");
    expect(within(labCard).getByText("経常利益：").parentElement).toHaveClass(
      "border-t",
    );

    const commonCard = list.getByText("全体共通").parentElement!;
    expect(within(commonCard).getByText("-￥50,000")).toHaveClass(
      "text-red-600",
    );
  });

  it("収支が無い月は表の代わりに案内を表示する", () => {
    renderWithMantine(<TeamProfitTable byTeam={[]} />);
    expect(
      screen.getByText("この月に計上される収支はありません。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("team-profit-card-list"),
    ).not.toBeInTheDocument();
  });
});
