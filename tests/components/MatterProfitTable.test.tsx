// @vitest-environment jsdom

import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MatterProfitTable from "@/app/components/profitLoss/MatterProfitTable";
import {
  buildLabelIndex,
  buildTeamMatterGroups,
} from "@/app/utils/profitLossLogic";
import {
  AdjustableAmount,
  BusinessLine,
  CostLine,
  ExtraEntryLine,
} from "@/app/types/types";
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
const extraEntries: ExtraEntryLine[] = [
  {
    extraEntryId: 3,
    entryType: "income",
    category: "協賛金",
    description: "協賛金収入",
    team: null,
    entryDate: "2026-07-10",
    billingAmount: 50000,
    expenseAmount: null,
  },
];

const renderTable = (canEditAdjustments = true, canEditLabels = true) => {
  const groups = buildTeamMatterGroups(
    businesses,
    costs,
    extraEntries,
    ["シンラボ"],
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
      groups={groups}
      revenueTotal={950000}
      matterCostTotal={300000}
      grossProfitTotal={650000}
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

describe("MatterProfitTable", () => {
  it("チーム行 → 案件行 → 案件内訳の順に展開でき、案件の売上・費用・粗利を表示する", () => {
    renderTable();

    // 初期表示はチーム行と合計行のみ
    expect(screen.getByRole("button", { name: /シンラボ/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("案件X")).not.toBeInTheDocument();
    expect(screen.getByText("合計")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /シンラボ/ }));
    const matterRow = screen.getByText("案件X").closest("tr")!;
    expect(within(matterRow).getByText("受託案件")).toBeInTheDocument();
    expect(within(matterRow).getByText("#12")).toBeInTheDocument();
    expect(within(matterRow).getByText("￥900,000")).toBeInTheDocument();
    expect(within(matterRow).getByText("￥300,000")).toBeInTheDocument();
    expect(within(matterRow).getByText("￥600,000")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^#12\s*案件X$/ }));
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

  it("「案件を表示」「実績額を修正」で対象を呼び出し元へ渡す", () => {
    const { onShowMatter, onEditAdjustment } = renderTable();
    fireEvent.click(screen.getByRole("button", { name: /シンラボ/ }));
    fireEvent.click(screen.getByRole("button", { name: "案件を表示" }));
    expect(onShowMatter).toHaveBeenCalledWith(12);

    fireEvent.click(screen.getByRole("button", { name: /^#12\s*案件X$/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "実績額を修正" })[0]);
    expect(onEditAdjustment).toHaveBeenCalledWith(
      { targetType: "business", businessId: 1 },
      "案件Xの売上（取引先A（経理表記））",
      expect.objectContaining({ actualAmount: 900000 }),
    );
  });

  it("実績額修正・タイトル変更の権限が無い場合は操作を表示しない（上書き後のタイトルは表示する）", () => {
    renderTable(false, false);
    fireEvent.click(screen.getByRole("button", { name: /シンラボ/ }));
    fireEvent.click(screen.getByRole("button", { name: /^#12\s*案件X$/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /シンラボ/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "案件Xのタイトルを変更" }),
    );
    expect(onEditTitle).toHaveBeenCalledWith(
      { targetType: "matter", matterId: 12 },
      "案件X",
      null,
    );
    fireEvent.click(screen.getByRole("button", { name: /^#12\s*案件X$/ }));
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
    // 経理追加収支の行・チームの見出しにはタイトル変更の操作を出さない
    fireEvent.click(screen.getByRole("button", { name: /全体共通/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "経理追加収支（案件外）" }),
    );
    expect(
      screen.queryByRole("button", { name: /協賛金収入のタイトルを変更/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /シンラボのタイトルを変更/ }),
    ).not.toBeInTheDocument();
  });

  it("チーム未指定の経理追加収支は全体共通グループの「経理追加収支（案件外）」行に入る", () => {
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: /全体共通/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "経理追加収支（案件外）" }),
    );
    expect(screen.getByText("協賛金収入")).toBeInTheDocument();
  });
});
