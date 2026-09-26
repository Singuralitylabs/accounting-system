// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import ProfitLossStatement, {
  BreakdownTab,
} from "@/app/components/profitLoss/ProfitLossStatement";
import { PLReportType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

// サーバ処理・データ取得を伴う子要素は表示順・タブの確認に不要なためモックする
vi.mock("@/app/utils/supabase/profitLossReport", () => ({
  getMatterInfoById: vi.fn(),
}));
vi.mock("@/app/hooks/useProfitLossAdjustments", () => ({
  useDeleteProfitLossAdjustment: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));
vi.mock("@/app/components/profitLoss/ClosingDiffPanel", () => ({
  default: () => null,
}));
vi.mock("@/app/components/profitLoss/ProfitLossAdjustmentModal", () => ({
  default: () => null,
}));
vi.mock("@/app/components/profitLoss/ProfitLossLabelModal", () => ({
  default: () => null,
}));
vi.mock("@/app/components/modal/MatterCardDetail", () => ({
  MatterCardDetail: () => null,
}));

const amount = (value: number) => ({
  sourceAmount: value,
  adjustmentAmount: 0,
  actualAmount: value,
  sourceChanged: false,
  adjustment: null,
  adjustmentReason: null,
});

const report = (withTeamBreakdown: boolean): PLReportType => ({
  month: "2026-08",
  revenueTotal: 120000,
  matterCostTotal: 30000,
  grossProfitTotal: 90000,
  matterBreakdowns: [
    {
      matterId: 12,
      matterTitle: "案件X",
      displayTitle: "案件X",
      isCustomTitle: false,
      category: "受託案件",
      team: "シンラボ",
      teams: ["シンラボ"],
      revenue: 120000,
      cost: 30000,
      grossProfit: 90000,
      businesses: [],
      costs: [],
    },
  ],
  categoryBreakdown: [
    { category: "受託案件", revenue: 120000, cost: 30000, grossProfit: 90000 },
  ],
  recurringCostTotal: 20000,
  recurringCostByItem: [
    {
      item: "通信費",
      amount: 20000,
      details: [
        {
          ...amount(20000),
          recurringCostId: 1,
          name: "回線",
          displayTitle: "回線",
          isCustomTitle: false,
          item: "通信費",
          team: null,
          paymentCycle: "monthly",
        },
      ],
    },
  ],
  extraEntries: [],
  ordinaryProfit: 70000,
  byTeam: withTeamBreakdown
    ? [
        {
          team: "シンラボ",
          revenue: 120000,
          matterCost: 30000,
          grossProfit: 90000,
          recurringCost: 20000,
          profit: 70000,
        },
      ]
    : undefined,
  undated: { revenue: 0, matterCost: 0 },
  closing: null,
});

// 月を切り替えても選択を保つため、タブの選択は親（ProfitLossView）が持つ
const Controlled = ({ withTeamBreakdown }: { withTeamBreakdown: boolean }) => {
  const [tab, setTab] = useState<BreakdownTab>("matter");
  return (
    <ProfitLossStatement
      report={report(withTeamBreakdown)}
      canEditAdjustments={withTeamBreakdown}
      canEditLabels={withTeamBreakdown}
      breakdownTab={tab}
      onBreakdownTabChange={setTab}
    />
  );
};

describe("ProfitLossStatement の表示順と収支の内訳タブ（Issue #152）", () => {
  it("損益計算書（売上総利益・管理費合計）を内訳タブより上に表示し、初期表示は案件別", () => {
    renderWithMantine(<Controlled withTeamBreakdown />);

    const grossProfitRow = screen.getByText("売上総利益（粗利）");
    const tabList = screen.getByRole("tablist");
    expect(
      grossProfitRow.compareDocumentPosition(tabList) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(screen.getByRole("tab", { name: "案件別" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "チーム別" })).toBeInTheDocument();
    expect(screen.getByText("案件X")).toBeVisible();
  });

  it("タブで分類別・チーム別に切り替えられる", () => {
    renderWithMantine(<Controlled withTeamBreakdown />);

    fireEvent.click(screen.getByRole("tab", { name: "分類別" }));
    expect(screen.getByRole("tab", { name: "分類別" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("columnheader", { name: "分類別収支" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "チーム別" }));
    expect(
      screen.getByRole("columnheader", { name: "チーム別収支" }),
    ).toBeVisible();
  });

  it("チーム別内訳を持たないロール（チームリーダー）にはチーム別タブを出さない", () => {
    renderWithMantine(<Controlled withTeamBreakdown={false} />);
    expect(
      screen.queryByRole("tab", { name: "チーム別" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("チーム別を選んだ状態でチーム別内訳の無い表示に切り替わったら案件別を表示する", () => {
    renderWithMantine(
      <ProfitLossStatement
        report={report(false)}
        canEditAdjustments={false}
        canEditLabels={false}
        breakdownTab="team"
      />,
    );
    expect(screen.getByRole("tab", { name: "案件別" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("管理費の内訳を「すべて開く」「すべて閉じる」でまとめて開閉する", () => {
    renderWithMantine(<Controlled withTeamBreakdown />);
    expect(screen.queryByText("回線")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "管理費の内訳をすべて開く" }),
    );
    expect(screen.getByText("回線")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "管理費の内訳をすべて閉じる" }),
    );
    expect(screen.queryByText("回線")).not.toBeInTheDocument();
  });
});
