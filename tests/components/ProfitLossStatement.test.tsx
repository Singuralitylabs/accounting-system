// @vitest-environment jsdom

import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import ProfitLossStatement, {
  BreakdownTab,
  resolveBreakdownTab,
} from "@/app/components/profitLoss/ProfitLossStatement";
import { ExtraEntryLine, PLReportType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

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

const extraEntry = (
  overrides: Partial<ExtraEntryLine> & Pick<ExtraEntryLine, "extraEntryId">,
): ExtraEntryLine => ({
  entryType: "income",
  category: "講演",
  description: "講演謝礼",
  team: "シンラボ",
  entryDate: "2026-08-10",
  billingAmount: 50000,
  expenseAmount: 10000,
  ...overrides,
});

// matter: revenue 120,000 - cost 30,000 = 90,000 (contract 70,000 / training 20,000)
// extra entries (income): billing 50,000 - expense 10,000 = 40,000
// admin cost: recurring 20,000 + extra entries (expense) 5,000 = 25,000
const report = (withTeamBreakdown: boolean): PLReportType => ({
  month: "2026-08",
  revenueTotal: 170000,
  matterCostTotal: 40000,
  grossProfitTotal: 130000,
  matterBreakdowns: [
    {
      matterId: 12,
      matterTitle: "案件X",
      displayTitle: "案件X",
      isCustomTitle: false,
      categories: ["受託案件"],
      teams: ["シンラボ"],
      revenue: 120000,
      cost: 30000,
      grossProfit: 90000,
      businesses: [],
      costs: [],
    },
  ],
  matterTotals: { revenue: 120000, cost: 30000, grossProfit: 90000 },
  categoryBreakdown: [
    { category: "受託案件", revenue: 90000, cost: 20000, grossProfit: 70000 },
    { category: "研修", revenue: 30000, cost: 10000, grossProfit: 20000 },
  ],
  extraIncome: {
    revenue: 50000,
    cost: 10000,
    grossProfit: 40000,
    entries: [{ ...extraEntry({ extraEntryId: 1 }), grossProfit: 40000 }],
  },
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
  extraExpense: {
    total: 5000,
    entries: [
      extraEntry({
        extraEntryId: 2,
        entryType: "expense",
        category: "交通費",
        description: "出張旅費",
        billingAmount: null,
        expenseAmount: 5000,
      }),
    ],
  },
  adminCostTotal: 25000,
  ordinaryProfit: 105000,
  byTeam: withTeamBreakdown
    ? [
        {
          team: "シンラボ",
          revenue: 170000,
          matterCost: 40000,
          grossProfit: 130000,
          adminCost: 25000,
          profit: 105000,
        },
      ]
    : undefined,
  undated: { revenue: 0, matterCost: 0, adminCost: 0 },
  closing: null,
});

// Tab selection is owned by the parent (ProfitLossView) so it survives month changes.
const Controlled = ({
  withTeamBreakdown,
  value = report(withTeamBreakdown),
}: {
  withTeamBreakdown: boolean;
  value?: PLReportType;
}) => {
  const [tab, setTab] = useState<BreakdownTab>("matter");
  return (
    <ProfitLossStatement
      report={value}
      canEditAdjustments={withTeamBreakdown}
      canEditLabels={withTeamBreakdown}
      breakdownTab={resolveBreakdownTab(tab, withTeamBreakdown)}
      onBreakdownTabChange={setTab}
    />
  );
};

const plRow = (label: string) => {
  const table = screen.getAllByRole("table")[0];
  const row = within(table)
    .getAllByRole("row")
    .find((tr) => within(tr).queryByText(label, { exact: true }));
  if (!row) throw new Error(`row not found: ${label}`);
  return row;
};

describe("ProfitLossStatement のサマリーカードと損益計算書（Issue #164）", () => {
  it("サマリーカードは 売上 / 粗利 / 経常利益 の 3 枚", () => {
    renderWithMantine(<Controlled withTeamBreakdown />);
    const cards = screen
      .getAllByText(/^(売上|粗利|経常利益|案件費用|管理費)$/)
      .filter((element) => element.closest("table") === null);
    expect(cards.map((card) => card.textContent)).toEqual([
      "売上",
      "粗利",
      "経常利益",
    ]);
  });

  it("売上総利益の内訳に案件（分類別の粗利を初期表示で展開）と経理追加収支（収入）を表示する", () => {
    renderWithMantine(<Controlled withTeamBreakdown />);

    const matterRow = plRow("案件");
    expect(matterRow).toHaveTextContent("（売上 ￥120,000 − 費用 ￥30,000）");
    expect(matterRow).toHaveTextContent("￥90,000");
    expect(plRow("受託案件")).toHaveTextContent("￥70,000");
    expect(plRow("研修")).toHaveTextContent("￥20,000");

    const extraRow = plRow("経理追加収支");
    expect(extraRow).toHaveTextContent("（請求 ￥50,000 − 経費 ￥10,000）");
    expect(extraRow).toHaveTextContent("￥40,000");
    expect(screen.queryByText("講演謝礼")).not.toBeInTheDocument();
    fireEvent.click(within(extraRow).getByRole("button", { expanded: false }));
    expect(plRow("講演謝礼")).toHaveTextContent("￥40,000");
  });

  it("経費の無い収入エントリの明細は「請求 X」のみを注記する", () => {
    const noExpense = {
      ...extraEntry({
        extraEntryId: 3,
        description: "寄付",
        expenseAmount: null,
      }),
      grossProfit: 50000,
    };
    renderWithMantine(
      <Controlled
        withTeamBreakdown
        value={{
          ...report(true),
          extraIncome: {
            revenue: 50000,
            cost: 0,
            grossProfit: 50000,
            entries: [noExpense],
          },
        }}
      />,
    );
    fireEvent.click(
      within(plRow("経理追加収支")).getByRole("button", { expanded: false }),
    );
    const row = plRow("寄付");
    expect(row).toHaveTextContent(
      "（講演 / シンラボ / 2026/08/10 / 請求 ￥50,000）",
    );
    expect(row).not.toHaveTextContent("経費");
  });

  it("経理追加収支（支出）は管理費合計の内訳に表示する", () => {
    renderWithMantine(<Controlled withTeamBreakdown />);

    const adminRow = plRow("管理費合計");
    expect(adminRow).toHaveTextContent("￥25,000");
    expect(adminRow).toHaveTextContent(
      "（定期費用 ￥20,000 ＋ 経理追加収支（支出） ￥5,000）",
    );
    const expenseRow = plRow("経理追加収支（支出）");
    expect(expenseRow).toHaveTextContent("￥5,000");
    expect(screen.queryByText("出張旅費")).not.toBeInTheDocument();
    fireEvent.click(
      within(expenseRow).getByRole("button", { expanded: false }),
    );
    expect(plRow("出張旅費")).toHaveTextContent("￥5,000");
    expect(
      screen
        .getAllByRole("row")
        .filter((tr) => within(tr).queryByText("出張旅費")),
    ).toHaveLength(1);
  });

  it("経理追加収支が無い月は経理追加収支の行を出さない", () => {
    renderWithMantine(
      <Controlled
        withTeamBreakdown
        value={{
          ...report(true),
          extraIncome: { revenue: 0, cost: 0, grossProfit: 0, entries: [] },
          extraExpense: { total: 0, entries: [] },
          adminCostTotal: 20000,
        }}
      />,
    );
    expect(screen.queryByText("経理追加収支")).not.toBeInTheDocument();
    expect(screen.queryByText("経理追加収支（支出）")).not.toBeInTheDocument();
    expect(plRow("管理費合計")).not.toHaveTextContent("定期費用");
  });

  it("独立した経理追加収支の表は表示しない", () => {
    renderWithMantine(<Controlled withTeamBreakdown />);
    expect(
      screen.queryByText(/案件に紐づかない収入・支出です/),
    ).not.toBeInTheDocument();
  });

  // The bulk toggle is rendered twice (table header from md up, above the table below md).
  it.each([
    ["テーブル見出し（md 以上）", 0],
    ["テーブル上部（モバイル）", 1],
  ])(
    "「すべて開く」「すべて閉じる」で損益計算書の内訳をまとめて開閉する: %s",
    (_label, index) => {
      renderWithMantine(<Controlled withTeamBreakdown />);
      expect(screen.queryByText("回線")).not.toBeInTheDocument();
      const openButtons = screen.getAllByRole("button", {
        name: "損益計算書の内訳をすべて開く",
      });
      expect(openButtons).toHaveLength(2);
      fireEvent.click(openButtons[index]);
      expect(screen.getByText("回線")).toBeInTheDocument();
      expect(screen.getByText("講演謝礼")).toBeInTheDocument();
      expect(screen.getByText("出張旅費")).toBeInTheDocument();
      fireEvent.click(
        screen.getAllByRole("button", {
          name: "損益計算書の内訳をすべて閉じる",
        })[index],
      );
      expect(screen.queryByText("回線")).not.toBeInTheDocument();
      expect(screen.queryByText("講演謝礼")).not.toBeInTheDocument();
      expect(screen.queryByText("出張旅費")).not.toBeInTheDocument();
      const plTable = screen.getAllByRole("table")[0];
      expect(within(plTable).queryByText("受託案件")).not.toBeInTheDocument();
    },
  );

  it("元データ・調整の列は md 未満で隠す（実績は常に表示する）", () => {
    renderWithMantine(<Controlled withTeamBreakdown />);
    const header = within(screen.getAllByRole("table")[0]).getByRole(
      "columnheader",
      { name: "元データ" },
    );
    expect(header.className).toContain("hidden");
    expect(header.className).toContain("md:table-cell");
    const actual = within(screen.getAllByRole("table")[0]).getByRole(
      "columnheader",
      { name: "実績" },
    );
    expect(actual.className).not.toContain("hidden");
  });

  it("日付未入力の支出エントリは月未確定の注記に管理費として表示する", () => {
    renderWithMantine(
      <Controlled
        withTeamBreakdown
        value={{
          ...report(true),
          undated: { revenue: 0, matterCost: 0, adminCost: 3000 },
        }}
      />,
    );
    expect(screen.getByText(/管理費: ￥3,000/)).toBeInTheDocument();
  });
});

describe("ProfitLossStatement の表示順と収支の内訳タブ（Issue #152 / #164）", () => {
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
    expect(
      within(
        screen
          .getByRole("columnheader", { name: "案件別収支" })
          .closest("table")!,
      ).getByText("案件X"),
    ).toBeVisible();
  });

  it("分類別タブは無く、チーム別に切り替えられる", () => {
    renderWithMantine(<Controlled withTeamBreakdown />);

    expect(
      screen.queryByRole("tab", { name: "分類別" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "チーム別" }));
    expect(
      screen.getByRole("columnheader", { name: "チーム別収支" }),
    ).toBeVisible();
  });

  it("チーム別内訳を持たないロール（チームリーダー）にはタブを出さず案件別収支のみ表示する", () => {
    renderWithMantine(<Controlled withTeamBreakdown={false} />);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "案件別収支" }),
    ).toBeVisible();
    expect(
      within(
        screen
          .getByRole("columnheader", { name: "案件別収支" })
          .closest("table")!,
      ).getByText("案件X"),
    ).toBeVisible();
  });
});

describe("resolveBreakdownTab（Issue #152）", () => {
  it("チーム別を選んでいてもチーム別内訳が無ければ案件別を表示する", () => {
    expect(resolveBreakdownTab("team", false)).toBe("matter");
    expect(resolveBreakdownTab("team", true)).toBe("team");
    expect(resolveBreakdownTab("matter", false)).toBe("matter");
  });
});
