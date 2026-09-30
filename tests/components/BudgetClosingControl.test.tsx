// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BudgetClosingControl from "@/app/components/budgetDeclarations/BudgetClosingControl";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const { confirmAction, closeMutation, reopenMutation } = vi.hoisted(() => ({
  confirmAction: vi.fn(),
  closeMutation: { mutateAsync: vi.fn(), isPending: false },
  reopenMutation: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("@/app/utils/confirmAction", () => ({ confirmAction }));
vi.mock("@/app/hooks/useBudgetDeclarationData", () => ({
  useCloseBudgetDeclarationMonth: () => closeMutation,
  useReopenBudgetDeclarationMonth: () => reopenMutation,
}));
vi.mock("@/app/utils/notify", () =>
  import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
);

describe("BudgetClosingControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeMutation.mutateAsync.mockResolvedValue(undefined);
    reopenMutation.mutateAsync.mockResolvedValue(undefined);
  });

  it("確認ダイアログの表示中はスイッチを無効化し、確認ダイアログが重複して出ない", async () => {
    let resolveConfirm: (value: boolean) => void = () => {};
    confirmAction.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveConfirm = resolve;
      }),
    );
    renderWithMantine(
      <BudgetClosingControl month="2026-10" closing={null} canClose />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "確定済み" }));

    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "確定済み" })).toBeDisabled(),
    );
    expect(confirmAction).toHaveBeenCalledTimes(1);

    resolveConfirm(false);
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "確定済み" }),
      ).not.toBeDisabled(),
    );
    expect(closeMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("確認後に確定を実行する", async () => {
    confirmAction.mockResolvedValue(true);
    renderWithMantine(
      <BudgetClosingControl month="2026-10" closing={null} canClose />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "確定済み" }));

    await waitFor(() =>
      expect(closeMutation.mutateAsync).toHaveBeenCalledWith("2026-10"),
    );
  });

  it("canClose=false ではスイッチを表示しない", () => {
    renderWithMantine(
      <BudgetClosingControl
        month="2026-10"
        closing={{
          month: "2026-10",
          closedAt: "2026-09-21T10:00:00+09:00",
          closedByName: "経理太郎",
        }}
        canClose={false}
      />,
    );

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText("確定済み")).toBeInTheDocument();
  });
});
