// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BudgetDeclarationItemTable from "@/app/components/budgetDeclarations/BudgetDeclarationItemTable";
import { BudgetDeclarationItemWithManagerName } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const { useBudgetDeclarationDetail } = vi.hoisted(() => ({
  useBudgetDeclarationDetail: vi.fn(),
}));

vi.mock("@/app/hooks/useBudgetDeclarationData", () => ({
  useBudgetDeclarationDetail,
}));

const item = (
  overrides: Partial<BudgetDeclarationItemWithManagerName> = {},
): BudgetDeclarationItemWithManagerName => ({
  id: 1,
  declaration_id: 7,
  entry_type: "income",
  category: "セミナー",
  description: "○○受託案件",
  amount: 100000,
  manager_id: 1,
  managerName: "山田太郎",
  display_order: 0,
  inserted_at: "",
  updated_at: "",
  ...overrides,
});

describe("BudgetDeclarationItemTable", () => {
  it("担当者が設定されている明細は担当者名を表示する", () => {
    useBudgetDeclarationDetail.mockReturnValue({
      data: { comment: null, items: [item({ managerName: "山田太郎" })] },
      isLoading: false,
      isError: false,
    });

    renderWithMantine(<BudgetDeclarationItemTable declarationId={7} />);

    expect(screen.getByText("山田太郎")).toBeInTheDocument();
  });

  it("担当者が未設定の明細は「-」を表示する", () => {
    useBudgetDeclarationDetail.mockReturnValue({
      data: {
        comment: null,
        items: [item({ manager_id: null, managerName: null })],
      },
      isLoading: false,
      isError: false,
    });

    renderWithMantine(<BudgetDeclarationItemTable declarationId={7} />);

    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("担当者の profiles が RLS で読めない場合も「-」を表示する（申告者名と同方式）", () => {
    useBudgetDeclarationDetail.mockReturnValue({
      data: {
        comment: null,
        items: [item({ manager_id: 999, managerName: null })],
      },
      isLoading: false,
      isError: false,
    });

    renderWithMantine(<BudgetDeclarationItemTable declarationId={7} />);

    expect(screen.getByText("-")).toBeInTheDocument();
  });
});
