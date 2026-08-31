// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BudgetDeclarationReminderSettings from "@/app/components/budgetDeclarations/BudgetDeclarationReminderSettings";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const {
  confirmAction,
  notifyError,
  notifySuccess,
  updateBudgetDeclarationReminderTargetDays,
} = vi.hoisted(() => ({
  confirmAction: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  updateBudgetDeclarationReminderTargetDays: vi.fn(),
}));

vi.mock("@/app/utils/confirmAction", () => ({ confirmAction }));
vi.mock("@/app/utils/notify", () => ({
  notifyError,
  notifySuccess,
  toErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));
vi.mock("@/app/utils/supabase/budgetDeclarationReminderSettings", () => ({
  updateBudgetDeclarationReminderTargetDays,
}));

describe("BudgetDeclarationReminderSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("初期取得に失敗した場合（null）はエラー表示のみで保存ボタンを出さない", () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={null} />,
    );

    expect(
      screen.getByText("リマインド設定の取得に失敗しました"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "保存" }),
    ).not.toBeInTheDocument();
  });

  it("対象日が空のときは無効である旨を警告表示する", () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[]} />,
    );

    expect(screen.getByText("現在リマインドは無効です")).toBeInTheDocument();
  });

  it("初期値の対象日がチェック済みで表示される", () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15, 20]} />,
    );

    expect(screen.getByRole("checkbox", { name: "15" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "20" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "18" })).not.toBeChecked();
    expect(
      screen.queryByText("現在リマインドは無効です"),
    ).not.toBeInTheDocument();
  });

  it("保存前に全チップを外しても『現在』の無効警告は出さず、保存時の警告のみ出す", () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "15" }));

    expect(
      screen.queryByText("現在リマインドは無効です"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("保存するとリマインドが無効になります"),
    ).toBeInTheDocument();
  });

  it("保存に失敗した場合は『現在』の状態を更新しない（無効警告を出さない）", async () => {
    confirmAction.mockResolvedValue(true);
    updateBudgetDeclarationReminderTargetDays.mockResolvedValue({
      error: { kind: "fetchFailed", message: "更新に失敗しました。" },
    });

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "15" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(
      screen.queryByText("現在リマインドは無効です"),
    ).not.toBeInTheDocument();
  });

  it("保存確認をキャンセルすると更新しない", async () => {
    confirmAction.mockResolvedValue(false);

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(updateBudgetDeclarationReminderTargetDays).not.toHaveBeenCalled();
  });

  it("対象日を空にして保存すると、リマインド停止を案内する確認ダイアログを出す", async () => {
    confirmAction.mockResolvedValue(true);
    updateBudgetDeclarationReminderTargetDays.mockResolvedValue({});

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "15" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(updateBudgetDeclarationReminderTargetDays).toHaveBeenCalledWith(
        [],
      ),
    );
    expect(confirmAction).toHaveBeenCalledWith(
      expect.stringContaining("リマインドが停止します"),
    );
    expect(notifySuccess).toHaveBeenCalled();
    // 保存成功後は「現在」の状態が更新され、無効警告に切り替わる
    expect(screen.getByText("現在リマインドは無効です")).toBeInTheDocument();
  });

  it("保存に成功したら成功通知を表示する", async () => {
    confirmAction.mockResolvedValue(true);
    updateBudgetDeclarationReminderTargetDays.mockResolvedValue({});

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15, 20]} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "18" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(updateBudgetDeclarationReminderTargetDays).toHaveBeenCalledWith([
        15, 18, 20,
      ]),
    );
    expect(notifySuccess).toHaveBeenCalled();
  });

  it("保存に失敗したらエラー通知を表示する", async () => {
    confirmAction.mockResolvedValue(true);
    updateBudgetDeclarationReminderTargetDays.mockResolvedValue({
      error: { kind: "fetchFailed", message: "更新に失敗しました。" },
    });

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("更新に失敗しました。"),
    );
  });
});
