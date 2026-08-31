// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BudgetDeclarationList from "@/app/components/budgetDeclarations/BudgetDeclarationList";
import { BudgetDeclarationStatusType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const {
  useBudgetDeclarationList,
  useBudgetDeclarationDetail,
  saveMutation,
  deleteMutation,
} = vi.hoisted(() => ({
  useBudgetDeclarationList: vi.fn(),
  useBudgetDeclarationDetail: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
  })),
  saveMutation: { mutateAsync: vi.fn(), isPending: false },
  deleteMutation: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("@/app/hooks/useBudgetDeclarationData", () => ({
  useBudgetDeclarationList,
  useBudgetDeclarationDetail,
  useSaveBudgetDeclaration: () => saveMutation,
  useDeleteBudgetDeclaration: () => deleteMutation,
}));

// 一覧の月ピッカーは Mantine のカレンダー UI で操作が煩雑なため、テストでは
// 「クリックすると月が変わる」だけの単純なスタブに差し替える
vi.mock("@/app/components/CustomMonthPicker", () => ({
  CustomMonthPicker: ({
    onChange,
  }: {
    onChange: (month: string | null) => void;
  }) => (
    <button type="button" onClick={() => onChange("2026-11")}>
      月を変更
    </button>
  ),
}));

const row = (
  overrides: Partial<BudgetDeclarationStatusType> = {},
): BudgetDeclarationStatusType => ({
  team: "開発チーム",
  declarationId: 1,
  isDeclared: true,
  declaredByName: "山田",
  updatedAt: "2026-08-20T10:00:00+09:00",
  summary: { incomeTotal: 100000, expenseTotal: 0, balance: 100000 },
  ...overrides,
});

describe("BudgetDeclarationList", () => {
  it("月切替直後（isPlaceholderData）は行の操作ボタンを無効化する", () => {
    useBudgetDeclarationList.mockReturnValue({
      data: [row()],
      isLoading: false,
      isError: false,
      error: null,
      isPlaceholderData: true,
    });

    renderWithMantine(
      <BudgetDeclarationList
        initialMonth="2026-10"
        initialData={null}
        initialDataUpdatedAt={Date.now()}
        canEditAllTeams
      />,
    );

    expect(screen.getByRole("button", { name: "明細を表示" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "編集する" })).toBeDisabled();
  });

  it("通常時（isPlaceholderData=false）は行の操作ボタンが有効", () => {
    useBudgetDeclarationList.mockReturnValue({
      data: [row()],
      isLoading: false,
      isError: false,
      error: null,
      isPlaceholderData: false,
    });

    renderWithMantine(
      <BudgetDeclarationList
        initialMonth="2026-10"
        initialData={null}
        initialDataUpdatedAt={Date.now()}
        canEditAllTeams
      />,
    );

    expect(
      screen.getByRole("button", { name: "明細を表示" }),
    ).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "編集する" })).not.toBeDisabled();
  });

  it("フォームを開いた後に月を変えても、開いているフォームの対象月は変わらない", () => {
    useBudgetDeclarationList.mockReturnValue({
      data: [row()],
      isLoading: false,
      isError: false,
      error: null,
      isPlaceholderData: false,
    });

    renderWithMantine(
      <BudgetDeclarationList
        initialMonth="2026-10"
        initialData={null}
        initialDataUpdatedAt={Date.now()}
        canEditAllTeams
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "編集する" }));
    expect(screen.getByDisplayValue("2026年10月")).toBeInTheDocument();

    // モーダル表示中は Mantine が背面を aria-hidden にするため hidden: true で取得する。
    // （実際のブラウザ操作では背面はクリックできないが、ロジック自体の回帰を検証する）
    fireEvent.click(
      screen.getByRole("button", { name: "月を変更", hidden: true }),
    );

    expect(screen.getByDisplayValue("2026年10月")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("2026年11月")).not.toBeInTheDocument();
  });
});
