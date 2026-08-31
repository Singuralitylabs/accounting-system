// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BudgetDeclarationList from "@/app/components/budgetDeclarations/BudgetDeclarationList";
import { BudgetDeclarationStatusType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const { useBudgetDeclarationList } = vi.hoisted(() => ({
  useBudgetDeclarationList: vi.fn(),
}));

vi.mock("@/app/hooks/useBudgetDeclarationData", () => ({
  useBudgetDeclarationList,
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
});
