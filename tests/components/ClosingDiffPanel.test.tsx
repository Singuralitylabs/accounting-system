// @vitest-environment jsdom

import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClosingDiffPanel from "@/app/components/profitLoss/ClosingDiffPanel";
import { ClosingDiff, PLReportType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const applyMutateAsync = vi.fn();
const dismissMutateAsync = vi.fn();
const undoMutateAsync = vi.fn();
vi.mock("@/app/hooks/useProfitLossClosing", () => ({
  useApplyClosingDiffs: () => ({
    mutateAsync: applyMutateAsync,
    isPending: false,
  }),
  useDismissClosingDiffs: () => ({
    mutateAsync: dismissMutateAsync,
    isPending: false,
  }),
  useUndoClosingDismissals: () => ({
    mutateAsync: undoMutateAsync,
    isPending: false,
  }),
}));
vi.mock("@/app/utils/confirmAction", () => ({
  confirmAction: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/app/utils/notify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/utils/notify")>()),
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

const baseDiff = (override: Partial<ClosingDiff>): ClosingDiff => ({
  key: "business:1",
  sourceType: "business",
  sourceId: 1,
  kind: "changed",
  amountChanged: true,
  classificationChanged: false,
  matterId: 12,
  matterTitle: "案件X",
  name: "取引先A",
  item: null,
  before: { actualAmount: 100000, team: "シンラボ", category: "受託案件" },
  after: { actualAmount: 120000, team: "シンラボ", category: "受託案件" },
  delta: 20000,
  movedMonth: null,
  movedMonthClosed: false,
  removedReason: null,
  dismissal: null,
  ...override,
});

const report = (diffs: PLReportType["closingDiffs"]): PLReportType => ({
  month: "2026-08",
  revenueTotal: 150000,
  matterCostTotal: 30000,
  grossProfitTotal: 120000,
  teamMatterGroups: [],
  categoryBreakdown: [],
  recurringCostTotal: 100000,
  recurringCostByItem: [],
  extraEntries: [],
  ordinaryProfit: 20000,
  undated: { revenue: 0, matterCost: 0 },
  closing: {
    month: "2026-08",
    closedAt: "2026-09-01T10:00:00+09:00",
    closedByName: "経理太郎",
    refreshedAt: null,
    refreshedByName: null,
  },
  closingDiffs: diffs,
});

const moved = baseDiff({
  key: "business:2",
  sourceId: 2,
  kind: "removed",
  amountChanged: false,
  name: "取引先B",
  before: { actualAmount: 50000, team: "シンラボ", category: "受託案件" },
  after: null,
  delta: -50000,
  removedReason: "moved",
  movedMonth: "2026-09",
  movedMonthClosed: true,
});

describe("ClosingDiffPanel", () => {
  beforeEach(() => {
    applyMutateAsync.mockReset().mockResolvedValue(undefined);
    dismissMutateAsync.mockReset().mockResolvedValue(undefined);
    undoMutateAsync.mockReset().mockResolvedValue(undefined);
  });

  it("差分が無い（チームリーダー等で closingDiffs が無い）場合は何も表示しない", () => {
    renderWithMantine(
      <ClosingDiffPanel
        report={report(undefined)}
        loadingMatterId={null}
        onShowMatter={vi.fn()}
      />,
    );
    expect(screen.queryByText(/件の変更があります/)).not.toBeInTheDocument();
    expect(screen.queryByText(/見送り済み/)).not.toBeInTheDocument();
  });

  it("未処理の件数・差分一覧を表示し、選択した差分の影響額と反映を行う", async () => {
    renderWithMantine(
      <ClosingDiffPanel
        report={report({ pending: [baseDiff({}), moved], dismissed: [] })}
        loadingMatterId={null}
        onShowMatter={vi.fn()}
      />,
    );
    expect(
      screen.getByText("この月は確定後に 2 件の変更があります"),
    ).toBeInTheDocument();
    expect(screen.getByText("金額変更")).toBeInTheDocument();
    expect(screen.getByText("2026年9月へ移動")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "注意: 相手側の月も確定済みです" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "案件X 取引先Aを選択" }),
    );
    // 影響額: 売上 150,000 → 170,000、経常利益 20,000 → 40,000
    const impact = screen.getByText(
      "選択した 1 件を反映した場合の影響額",
    ).parentElement!;
    expect(within(impact).getByText("￥170,000")).toBeInTheDocument();
    expect(within(impact).getByText("￥40,000")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "選択した変更を反映" }));
    await vi.waitFor(() =>
      expect(applyMutateAsync).toHaveBeenCalledWith({
        month: "2026-08",
        keys: [{ sourceType: "business", sourceId: 1 }],
      }),
    );
  });

  it("選択した差分を見送れ、見送り済みから取り消せる", async () => {
    const dismissed = baseDiff({
      key: "cost:5",
      sourceType: "cost",
      sourceId: 5,
      name: "外注",
      item: "外注費",
      dismissal: {
        dismissedAt: "2026-09-02T10:00:00+09:00",
        dismissedByName: "経理太郎",
      },
    });
    renderWithMantine(
      <ClosingDiffPanel
        report={report({ pending: [baseDiff({})], dismissed: [dismissed] })}
        loadingMatterId={null}
        onShowMatter={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "案件X 取引先Aを選択" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "選択した変更を見送る" }),
    );
    await vi.waitFor(() =>
      expect(dismissMutateAsync).toHaveBeenCalledWith({
        month: "2026-08",
        keys: [{ sourceType: "business", sourceId: 1 }],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /見送り済み（1件）/ }));
    expect(screen.getByText("2026/09/02 10:00 経理太郎")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "案件X 外注を選択" }));
    fireEvent.click(screen.getByRole("button", { name: "見送りを取り消す" }));
    await vi.waitFor(() =>
      expect(undoMutateAsync).toHaveBeenCalledWith({
        month: "2026-08",
        keys: [{ sourceType: "cost", sourceId: 5 }],
      }),
    );
  });
});
