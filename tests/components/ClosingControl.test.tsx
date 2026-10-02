// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClosingControl from "@/app/components/profitLoss/ClosingControl";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const { confirmAction, closeMutation, reopenMutation } = vi.hoisted(() => ({
  confirmAction: vi.fn(),
  closeMutation: { mutateAsync: vi.fn(), isPending: false },
  reopenMutation: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("@/app/utils/confirmAction", () => ({ confirmAction }));
vi.mock("@/app/hooks/useProfitLossClosing", () => ({
  useCloseProfitLossMonth: () => closeMutation,
  useReopenProfitLossMonth: () => reopenMutation,
}));
vi.mock("@/app/utils/notify", () =>
  import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
);

describe("ClosingControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeMutation.isPending = false;
    reopenMutation.isPending = false;
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
      <ClosingControl month="2026-10" closing={null} canClose />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "確定済み" }));

    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "確定済み" })).toBeDisabled(),
    );
    expect(confirmAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status", { name: "読み込み中" })).toBeNull();

    resolveConfirm(false);
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "確定済み" }),
      ).not.toBeDisabled(),
    );
    expect(closeMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("確定処理中は読み込み中を表示し、スイッチを無効化する", () => {
    closeMutation.isPending = true;
    renderWithMantine(
      <ClosingControl month="2026-10" closing={null} canClose />,
    );

    expect(screen.getByRole("switch", { name: "確定済み" })).toBeDisabled();
    expect(
      screen.getByRole("status", { name: "読み込み中" }),
    ).toBeInTheDocument();
  });
});
