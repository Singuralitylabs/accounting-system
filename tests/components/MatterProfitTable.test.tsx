// @vitest-environment jsdom

import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MatterProfitTable from "@/app/components/profitLoss/MatterProfitTable";
import {
  buildLabelIndex,
  buildMatterBreakdowns,
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
const renderTable = (
  canEditAdjustments = true,
  canEditLabels = true,
  hasExtraEntries = true,
) => {
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
      hasExtraEntries={hasExtraEntries}
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

const matterToggle = (id: number, title: string) =>
  screen.getByRole("button", { name: new RegExp(`^#${id}\\s*${title}$`) });

describe("MatterProfitTable", () => {
  it("チームの階層なしで案件を ID 順に並べ、チーム列と案件の売上・費用・粗利を表示する（Issue #152）", () => {
    renderTable();

    const rows = screen.getAllByRole("row");
    const matterRowX = screen.getByText("案件X").closest("tr")!;
    const matterRowY = screen.getByText("案件Y").closest("tr")!;
    expect(rows.indexOf(matterRowX)).toBeLessThan(rows.indexOf(matterRowY));
    expect(within(matterRowX).getByText("シンラボ")).toBeInTheDocument();
    expect(within(matterRowY).getByText("SDGs")).toBeInTheDocument();
    expect(within(matterRowX).getByText("受託案件")).toBeInTheDocument();
    expect(within(matterRowX).getByText("#12")).toBeInTheDocument();
    expect(within(matterRowX).getByText("￥900,000")).toBeInTheDocument();
    expect(within(matterRowX).getByText("￥300,000")).toBeInTheDocument();
    expect(within(matterRowX).getByText("￥600,000")).toBeInTheDocument();
    // チームの見出し行は無い
    expect(
      screen.queryByRole("button", { name: /^シンラボ/ }),
    ).not.toBeInTheDocument();

    // 案件の合計（経理追加収支は含まない旨を注記する）
    const totalRow = screen.getByText("案件の合計").closest("tr")!;
    expect(within(totalRow).getByText("￥1,100,000")).toBeInTheDocument();
    expect(within(totalRow).getByText("￥800,000")).toBeInTheDocument();
    expect(
      screen.getByText(/経理追加収支（案件外）はこの表に含みません/),
    ).toBeInTheDocument();

    fireEvent.click(matterToggle(12, "案件X"));
    // 上書きタイトルを表示し、元の名称はバッジのツールチップで確認できる
    expect(screen.getByText("取引先A（経理表記）")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "元の名称: 取引先A" }),
    ).toBeInTheDocument();
    expect(screen.getByText("外注費用")).toBeInTheDocument();
    // 調整がある明細は元データ・調整を補足表示し、調整ありバッジを付ける
    expect(
      screen.getByText("元データ ￥1,000,000 / 調整 -￥100,000"),
    ).toBeInTheDocument();
    expect(screen.getByText("調整あり")).toBeInTheDocument();
  });

  it("経理追加収支が無い月は注記を出さない", () => {
    renderTable(true, true, false);
    expect(
      screen.queryByText(/経理追加収支（案件外）はこの表に含みません/),
    ).not.toBeInTheDocument();
  });

  it("「すべて開く」「すべて閉じる」で全案件の内訳をまとめて開閉する（Issue #152）", () => {
    renderTable();
    expect(screen.queryByText("外注費用")).not.toBeInTheDocument();
    expect(screen.queryByText("取引先B")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "案件別収支をすべて開く" }),
    );
    expect(screen.getByText("外注費用")).toBeInTheDocument();
    expect(screen.getByText("取引先B")).toBeInTheDocument();
    expect(matterToggle(12, "案件X")).toHaveAttribute("aria-expanded", "true");
    expect(matterToggle(15, "案件Y")).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(
      screen.getByRole("button", { name: "案件別収支をすべて閉じる" }),
    );
    expect(screen.queryByText("外注費用")).not.toBeInTheDocument();
    expect(screen.queryByText("取引先B")).not.toBeInTheDocument();
  });

  it("「案件を表示」「実績額を修正」で対象を呼び出し元へ渡す", () => {
    const { onShowMatter, onEditAdjustment } = renderTable();
    fireEvent.click(
      within(screen.getByText("案件X").closest("tr")!).getByRole("button", {
        name: "案件を表示",
      }),
    );
    expect(onShowMatter).toHaveBeenCalledWith(12);

    fireEvent.click(matterToggle(12, "案件X"));
    fireEvent.click(screen.getAllByRole("button", { name: "実績額を修正" })[0]);
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
    expect(screen.getByText("取引先A（経理表記）")).toBeInTheDocument();
  });

  it("案件行・明細行のタイトル変更で対象と元の名称・現在の上書きタイトルを渡す", () => {
    const { onEditTitle } = renderTable();
    fireEvent.click(
      screen.getByRole("button", { name: "案件Xのタイトルを変更" }),
    );
    expect(onEditTitle).toHaveBeenCalledWith(
      { targetType: "matter", matterId: 12 },
      "案件X",
      null,
    );
    fireEvent.click(matterToggle(12, "案件X"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "取引先A（経理表記）のタイトルを変更",
      }),
    );
    expect(onEditTitle).toHaveBeenLastCalledWith(
      { targetType: "business", businessId: 1 },
      "取引先A",
      "取引先A（経理表記）",
    );
  });
});
