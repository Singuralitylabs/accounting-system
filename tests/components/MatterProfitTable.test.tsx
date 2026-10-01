// @vitest-environment jsdom

import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MatterProfitTable from "@/app/components/profitLoss/MatterProfitTable";
import {
  buildLabelIndex,
  buildMatterBreakdowns,
  sumMatterBreakdowns,
} from "@/app/utils/profitLossLogic";
import { AdjustableAmount, BusinessLine, CostLine } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const amount = (value: number, adjustment = 0): AdjustableAmount => ({
  sourceAmount: value,
  adjustmentAmount: adjustment,
  actualAmount: value + adjustment,
  sourceChanged: false,
  adjustment: null,
  adjustmentReason: adjustment === 0 ? null : "値引き",
});

const businesses: BusinessLine[] = [
  {
    ...amount(1000000, -100000),
    businessId: 1,
    name: "取引先A",
    matterId: 12,
    matterUserId: 3,
    matterTitle: "案件X",
    category: "受託案件",
    team: "シンラボ",
  },
];
const otherTeamBusiness: BusinessLine = {
  ...amount(200000),
  businessId: 2,
  name: "取引先B",
  matterId: 15,
  matterUserId: 4,
  matterTitle: "案件Y",
  category: "会員費",
  team: "SDGs",
};
const costs: CostLine[] = [
  {
    ...amount(300000),
    costId: 5,
    name: "外注費用",
    item: "外注費",
    matterId: 12,
    matterUserId: 3,
    matterTitle: "案件X",
    category: "受託案件",
    team: "シンラボ",
  },
];
const renderTable = (canEditAdjustments = true, canEditLabels = true) => {
  const matters = buildMatterBreakdowns(
    [...businesses, otherTeamBusiness],
    costs,
    buildLabelIndex([
      {
        matter_id: null,
        business_id: 1,
        cost_id: null,
        recurring_cost_id: null,
        label: "取引先A（経理表記）",
      },
    ]),
  );
  const onShowMatter = vi.fn();
  const onEditAdjustment = vi.fn();
  const onEditTitle = vi.fn();
  renderWithMantine(
    <MatterProfitTable
      matters={matters}
      totals={sumMatterBreakdowns(matters)}
      canEditAdjustments={canEditAdjustments}
      loadingMatterId={null}
      onShowMatter={onShowMatter}
      onEditAdjustment={onEditAdjustment}
      canEditLabels={canEditLabels}
      onEditTitle={onEditTitle}
    />,
  );
  return { onShowMatter, onEditAdjustment, onEditTitle };
};

const table = () => screen.getByRole("table");
const cardList = () => screen.getByTestId("matter-profit-card-list");
const cards = () => within(cardList());

const cardOf = (title: string) => {
  let node: HTMLElement | null = cards().getByText(title);
  const list = cardList();
  while (node && node.parentElement !== list) {
    node = node.parentElement;
  }
  if (!node) {
    throw new Error(`カードが見つかりません: ${title}`);
  }
  return node;
};

const matterToggle = (id: number, title: string) =>
  within(table()).getByRole("button", {
    name: new RegExp(`^#${id}\\s*${title}$`),
  });

const cardToggle = (id: number, title: string) =>
  cards().getByRole("button", { name: new RegExp(`^#${id}\\s*${title}$`) });

describe("MatterProfitTable", () => {
  it("チームの階層なしで案件を ID 順に並べ、チーム列と案件の売上・費用・粗利を表示する（Issue #152）", () => {
    renderTable();

    expect(cardList()).toHaveClass("md:hidden");
    expect(table().parentElement?.parentElement).toHaveClass(
      "hidden",
      "md:block",
    );

    const rows = within(table()).getAllByRole("row");
    const matterRowX = within(table()).getByText("案件X").closest("tr")!;
    const matterRowY = within(table()).getByText("案件Y").closest("tr")!;
    expect(rows.indexOf(matterRowX)).toBeLessThan(rows.indexOf(matterRowY));
    expect(within(matterRowX).getByText("シンラボ")).toBeInTheDocument();
    expect(within(matterRowY).getByText("SDGs")).toBeInTheDocument();
    expect(within(matterRowX).getByText("受託案件")).toBeInTheDocument();
    expect(within(matterRowX).getByText("#12")).toBeInTheDocument();
    expect(within(matterRowX).getByText("￥900,000")).toBeInTheDocument();
    expect(within(matterRowX).getByText("￥300,000")).toBeInTheDocument();
    expect(within(matterRowX).getByText("￥600,000")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^シンラボ/ }),
    ).not.toBeInTheDocument();

    const totalRow = within(table()).getByText("案件の合計").closest("tr")!;
    expect(within(totalRow).getByText("￥1,100,000")).toBeInTheDocument();
    expect(within(totalRow).getByText("￥800,000")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        /案件の合計は、損益計算書の売上総利益の「案件」行と一致します/,
      ),
    ).toHaveLength(2);
    expect(
      screen.queryByText(
        /売上総利益とは一致しません|案件の合計とは一致しません/,
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(matterToggle(12, "案件X"));
    expect(
      within(table()).getByText("取引先A（経理表記）"),
    ).toBeInTheDocument();
    expect(
      within(table()).getByRole("button", { name: "元の名称: 取引先A" }),
    ).toBeInTheDocument();
    expect(within(table()).getByText("外注費用")).toBeInTheDocument();
    expect(
      within(table()).getByText("元データ ￥1,000,000 / 調整 -￥100,000"),
    ).toBeInTheDocument();
    expect(within(table()).getByText("調整あり")).toBeInTheDocument();
  });

  it("明細によって分類・チームが異なる案件は分類・チームを並べて注意アイコンを付ける（Issue #152）", () => {
    const matters = buildMatterBreakdowns(
      businesses,
      [{ ...costs[0], team: "SDGs", category: "会員費" }],
      buildLabelIndex([]),
    );
    renderWithMantine(
      <MatterProfitTable
        matters={matters}
        totals={sumMatterBreakdowns(matters)}
        canEditAdjustments={false}
        loadingMatterId={null}
        onShowMatter={vi.fn()}
        onEditAdjustment={vi.fn()}
        canEditLabels={false}
        onEditTitle={vi.fn()}
      />,
    );
    const matterRow = within(table()).getByText("案件X").closest("tr")!;
    expect(within(matterRow).getByText("シンラボ / SDGs")).toBeInTheDocument();
    expect(
      within(matterRow).getByRole("img", {
        name: /明細によってチームが異なります/,
      }),
    ).toBeInTheDocument();
    expect(within(matterRow).getByText("受託案件")).toBeInTheDocument();
    expect(within(matterRow).getByText("会員費")).toBeInTheDocument();
    expect(
      within(matterRow).getByRole("img", {
        name: /明細によって分類が異なります/,
      }),
    ).toBeInTheDocument();
  });

  it("分類・チームが 1 つの案件には注意アイコンを出さず、操作列の見出しに名前を付ける", () => {
    renderTable();
    expect(
      screen.queryByRole("img", {
        name: /明細によって(分類|チーム)が異なります/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "操作" }),
    ).toBeInTheDocument();
  });

  // The bulk toggle is rendered twice (table header from md up, above the card list below md) and shares one expansion set.
  it.each([
    ["テーブル見出し（md 以上）", 0],
    ["カード一覧の上（モバイル）", 1],
  ])(
    "「すべて開く」「すべて閉じる」で全案件の内訳をまとめて開閉する（Issue #152 / #235）: %s",
    (_label, index) => {
      renderTable();
      expect(screen.queryByText("外注費用")).not.toBeInTheDocument();
      expect(screen.queryByText("取引先B")).not.toBeInTheDocument();

      const openButtons = screen.getAllByRole("button", {
        name: "案件別収支をすべて開く",
      });
      expect(openButtons).toHaveLength(2);
      fireEvent.click(openButtons[index]);
      expect(within(table()).getByText("外注費用")).toBeInTheDocument();
      expect(cards().getByText("外注費用")).toBeInTheDocument();
      expect(within(table()).getByText("取引先B")).toBeInTheDocument();
      expect(cards().getByText("取引先B")).toBeInTheDocument();
      expect(matterToggle(12, "案件X")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(cardToggle(12, "案件X")).toHaveAttribute("aria-expanded", "true");
      expect(matterToggle(15, "案件Y")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(cardToggle(15, "案件Y")).toHaveAttribute("aria-expanded", "true");

      fireEvent.click(
        screen.getAllByRole("button", { name: "案件別収支をすべて閉じる" })[
          index
        ],
      );
      expect(screen.queryByText("外注費用")).not.toBeInTheDocument();
      expect(screen.queryByText("取引先B")).not.toBeInTheDocument();
    },
  );

  it("チーム列は md 未満で隠し、売上・案件費用・粗利の列は残す", () => {
    renderTable();
    const team = screen.getByRole("columnheader", { name: "チーム" });
    expect(team.className).toContain("hidden");
    expect(team.className).toContain("md:table-cell");
    for (const name of ["売上", "案件費用", "粗利"]) {
      expect(
        screen.getByRole("columnheader", { name }).className,
      ).not.toContain("hidden");
    }
  });

  it("「案件を表示」「実績額を修正」で対象を呼び出し元へ渡す", () => {
    const { onShowMatter, onEditAdjustment } = renderTable();
    fireEvent.click(
      within(within(table()).getByText("案件X").closest("tr")!).getByRole(
        "button",
        {
          name: "案件を表示",
        },
      ),
    );
    expect(onShowMatter).toHaveBeenCalledWith(12);

    fireEvent.click(matterToggle(12, "案件X"));
    fireEvent.click(
      within(table()).getAllByRole("button", { name: "実績額を修正" })[0],
    );
    expect(onEditAdjustment).toHaveBeenCalledWith(
      { targetType: "business", businessId: 1 },
      "案件Xの売上（取引先A（経理表記））",
      expect.objectContaining({ actualAmount: 900000 }),
    );
  });

  it("実績額修正・タイトル変更の権限が無い場合は操作を表示しない（上書き後のタイトルは表示する）", () => {
    renderTable(false, false);
    fireEvent.click(matterToggle(12, "案件X"));
    expect(
      screen.queryByRole("button", { name: "実績額を修正" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /タイトルを変更/ }),
    ).not.toBeInTheDocument();
    expect(
      within(table()).getByText("取引先A（経理表記）"),
    ).toBeInTheDocument();
  });

  it("案件行・明細行のタイトル変更で対象と元の名称・現在の上書きタイトルを渡す", () => {
    const { onEditTitle } = renderTable();
    fireEvent.click(
      within(table()).getByRole("button", { name: "案件Xのタイトルを変更" }),
    );
    expect(onEditTitle).toHaveBeenCalledWith(
      { targetType: "matter", matterId: 12 },
      "案件X",
      null,
    );
    fireEvent.click(matterToggle(12, "案件X"));
    fireEvent.click(
      within(table()).getByRole("button", {
        name: "取引先A（経理表記）のタイトルを変更",
      }),
    );
    expect(onEditTitle).toHaveBeenLastCalledWith(
      { targetType: "business", businessId: 1 },
      "取引先A",
      "取引先A（経理表記）",
    );
  });

  it("カードに金額・チーム・分類・確定後の変更を出し、展開で明細と実績額の修正を出す（Issue #235）", () => {
    const matters = buildMatterBreakdowns(
      [...businesses, otherTeamBusiness],
      costs,
      buildLabelIndex([
        {
          matter_id: null,
          business_id: 1,
          cost_id: null,
          recurring_cost_id: null,
          label: "取引先A（経理表記）",
        },
      ]),
    );
    const onShowMatter = vi.fn();
    const onEditAdjustment = vi.fn();
    const onEditTitle = vi.fn();
    renderWithMantine(
      <MatterProfitTable
        matters={matters}
        totals={sumMatterBreakdowns(matters)}
        canEditAdjustments
        isClosed={false}
        changedMatterIds={new Set([12])}
        changedKeys={new Set(["cost:5"])}
        loadingMatterId={12}
        onShowMatter={onShowMatter}
        onEditAdjustment={onEditAdjustment}
        canEditLabels
        onEditTitle={onEditTitle}
      />,
    );

    const cardX = cardOf("案件X");
    const cardToggleButton = cardToggle(12, "案件X");
    expect(cardToggleButton).toHaveClass("w-full", "min-w-0");
    expect(within(cardToggleButton).getByText("案件X")).toHaveClass(
      "break-words",
    );
    expect(within(cardX).getByText("#12")).toBeInTheDocument();
    expect(within(cardX).getByText("シンラボ")).toBeInTheDocument();
    expect(within(cardX).getByText("受託案件")).toBeInTheDocument();
    expect(within(cardX).getByText("￥900,000")).toBeInTheDocument();
    expect(within(cardX).getByText("￥300,000")).toBeInTheDocument();
    expect(within(cardX).getByText("￥600,000")).toHaveClass("text-green-700");
    expect(
      within(cardX).getByRole("img", {
        name: "この案件は確定後に変更があります（未反映）",
      }),
    ).toBeInTheDocument();
    expect(
      within(cardX).getByRole("button", { name: "案件を表示" }),
    ).toHaveAttribute("data-loading", "true");

    fireEvent.click(cardToggle(12, "案件X"));
    expect(matterToggle(12, "案件X")).toHaveAttribute("aria-expanded", "true");
    expect(within(cardX).getByText("売上")).toBeInTheDocument();
    expect(within(cardX).getByText("取引先A（経理表記）")).toBeInTheDocument();
    expect(within(cardX).getByText("費用")).toBeInTheDocument();
    expect(within(cardX).getByText("外注費用")).toBeInTheDocument();
    expect(within(cardX).getByText("（外注費）")).toBeInTheDocument();
    expect(
      within(cardX).getByText("元データ ￥1,000,000 / 調整 -￥100,000"),
    ).toBeInTheDocument();
    expect(within(cardX).getByText("調整あり")).toBeInTheDocument();
    expect(
      within(cardX).getByRole("img", {
        name: "確定後に変更があります（未反映）",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(cardX).getByRole("button", { name: "案件Xのタイトルを変更" }),
    );
    expect(onEditTitle).toHaveBeenCalledWith(
      { targetType: "matter", matterId: 12 },
      "案件X",
      null,
    );
    fireEvent.click(
      within(cardX).getByRole("button", {
        name: "取引先A（経理表記）のタイトルを変更",
      }),
    );
    expect(onEditTitle).toHaveBeenLastCalledWith(
      { targetType: "business", businessId: 1 },
      "取引先A",
      "取引先A（経理表記）",
    );

    const adjust = within(cardX).getAllByRole("button", {
      name: "実績額を修正",
    })[0];
    expect(adjust).toBeEnabled();
    fireEvent.click(adjust);
    expect(onEditAdjustment).toHaveBeenCalledWith(
      { targetType: "business", businessId: 1 },
      "案件Xの売上（取引先A（経理表記））",
      expect.objectContaining({ actualAmount: 900000 }),
    );
  });

  it("確定済みの月はカードの「実績額を修正」を無効にする（Issue #235）", () => {
    const matters = buildMatterBreakdowns(
      businesses,
      costs,
      buildLabelIndex([]),
    );
    renderWithMantine(
      <MatterProfitTable
        matters={matters}
        totals={sumMatterBreakdowns(matters)}
        canEditAdjustments
        isClosed
        loadingMatterId={null}
        onShowMatter={vi.fn()}
        onEditAdjustment={vi.fn()}
        canEditLabels={false}
        onEditTitle={vi.fn()}
      />,
    );
    fireEvent.click(cardToggle(12, "案件X"));
    for (const button of cards().getAllByRole("button", {
      name: "実績額を修正",
    })) {
      expect(button).toBeDisabled();
    }
  });

  it("カードの「案件を表示」で対象の案件 ID を渡す（Issue #235）", () => {
    const { onShowMatter } = renderTable();
    fireEvent.click(cards().getAllByRole("button", { name: "案件を表示" })[0]);
    expect(onShowMatter).toHaveBeenCalledWith(12);
  });

  it("カードの末尾に案件の合計と注記を出す（Issue #235）", () => {
    renderTable();
    const totalsCard = cardOf("案件の合計");
    expect(totalsCard).toHaveClass("bg-slate-100");
    expect(within(totalsCard).getByText("￥1,100,000")).toBeInTheDocument();
    expect(within(totalsCard).getByText("￥300,000")).toBeInTheDocument();
    expect(within(totalsCard).getByText("￥800,000")).toHaveClass(
      "text-green-700",
    );
    expect(
      cards().getByText(
        /案件の合計は、損益計算書の売上総利益の「案件」行と一致します/,
      ),
    ).toBeInTheDocument();
  });

  it("0 件の月は表とカードの両方に案内を出す（Issue #235）", () => {
    renderWithMantine(
      <MatterProfitTable
        matters={[]}
        totals={{ revenue: 0, cost: 0, grossProfit: 0 }}
        canEditAdjustments={false}
        loadingMatterId={null}
        onShowMatter={vi.fn()}
        onEditAdjustment={vi.fn()}
        canEditLabels={false}
        onEditTitle={vi.fn()}
      />,
    );
    expect(
      cards().getByText("この月に計上される案件はありません。"),
    ).toBeInTheDocument();
    expect(
      within(table()).getByText("この月に計上される案件はありません。"),
    ).toBeInTheDocument();
  });

  it("明細の分類・チームが分かれる案件はカードにも注意アイコンを付ける（Issue #235）", () => {
    const matters = buildMatterBreakdowns(
      businesses,
      [{ ...costs[0], team: "SDGs", category: "会員費" }],
      buildLabelIndex([]),
    );
    renderWithMantine(
      <MatterProfitTable
        matters={matters}
        totals={sumMatterBreakdowns(matters)}
        canEditAdjustments={false}
        loadingMatterId={null}
        onShowMatter={vi.fn()}
        onEditAdjustment={vi.fn()}
        canEditLabels={false}
        onEditTitle={vi.fn()}
      />,
    );
    const card = cardOf("案件X");
    expect(within(card).getByText("シンラボ / SDGs")).toBeInTheDocument();
    expect(within(card).getByText("受託案件")).toBeInTheDocument();
    expect(within(card).getByText("会員費")).toBeInTheDocument();
    expect(
      within(card).getByRole("img", { name: /明細によってチームが異なります/ }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("img", { name: /明細によって分類が異なります/ }),
    ).toBeInTheDocument();
  });
});
