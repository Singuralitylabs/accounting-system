// @vitest-environment jsdom

import { ModalsProvider } from "@mantine/modals";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BudgetDeclarationReminderSettings from "@/app/components/budgetDeclarations/BudgetDeclarationReminderSettings";
import { notifyError, notifySuccess } from "@/app/utils/notify";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const { confirmAction, updateBudgetDeclarationReminderTargetDays } = vi.hoisted(
  () => ({
    confirmAction: vi.fn(),
    updateBudgetDeclarationReminderTargetDays: vi.fn(),
  }),
);

vi.mock("@/app/utils/confirmAction", () => ({ confirmAction }));
vi.mock("@/app/utils/notify", () =>
  import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
);
vi.mock("@/app/utils/supabase/budgetDeclarationReminderSettings", () => ({
  updateBudgetDeclarationReminderTargetDays,
}));

// 「リマインド設定」ボタンを押してモーダルを開く（Mantine の入場トランジションで
// 1 tick 遅れてマウントされるため、ダイアログが現れるまで待つ）
const openModal = async () => {
  fireEvent.click(screen.getByRole("button", { name: "リマインド設定" }));
  await screen.findByRole("dialog");
};

// モーダルが閉じきる（Mantine の退場トランジション後にアンマウントされる）まで待つ
const waitForModalClosed = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

// モーダルのオーバーレイ（背景）をクリックする
const clickOverlay = () => {
  const overlay = document.querySelector(".mantine-Modal-overlay");
  if (!overlay) throw new Error("モーダルのオーバーレイが見つかりません");
  fireEvent.mouseDown(overlay);
  fireEvent.click(overlay);
};

// 閉じる操作が受け付けられていれば退場トランジション（既定 200ms）後に
// アンマウントされるため、それより長く待ってからモーダルが残っていることを確認する
const waitLongerThanTransition = () =>
  new Promise((resolve) => setTimeout(resolve, 400));

describe("BudgetDeclarationReminderSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("初期状態ではボタンのみ表示し、設定内容は展開しない", () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    expect(
      screen.getByRole("button", { name: "リマインド設定" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "15" }),
    ).not.toBeInTheDocument();
  });

  it("初期取得に失敗した場合（null）もボタンは表示し、モーダル内はエラー表示のみで保存ボタンを出さない", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={null} />,
    );

    // 取得失敗時は状態が不明なので「リマインド無効」バッジは出さない
    expect(screen.queryByText("リマインド無効")).not.toBeInTheDocument();

    await openModal();

    expect(
      screen.getByText("リマインド設定の取得に失敗しました"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "保存" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("保存済みの対象日が0件のときはボタンの横に「リマインド無効」バッジを表示する", () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[]} />,
    );

    expect(screen.getByText("リマインド無効")).toBeInTheDocument();
  });

  it("保存済みの対象日があるときは「リマインド無効」バッジを表示しない", () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    expect(screen.queryByText("リマインド無効")).not.toBeInTheDocument();
  });

  it("対象日が空のときはモーダル内で無効である旨を警告表示する", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[]} />,
    );

    await openModal();

    expect(screen.getByText("現在リマインドは無効です")).toBeInTheDocument();
  });

  it("モーダルを開くと保存済みの対象日がチェック済みで表示される", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15, 20]} />,
    );

    await openModal();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "15" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "20" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "18" })).not.toBeChecked();
    expect(
      screen.queryByText("現在リマインドは無効です"),
    ).not.toBeInTheDocument();
  });

  it("保存前に全チップを外しても『現在』の無効警告は出さず、保存時の警告のみ出す", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    await openModal();
    fireEvent.click(screen.getByRole("checkbox", { name: "15" }));

    expect(
      screen.queryByText("現在リマインドは無効です"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("保存するとリマインドが無効になります"),
    ).toBeInTheDocument();
    // 未保存のためバッジも出さない
    expect(screen.queryByText("リマインド無効")).not.toBeInTheDocument();
  });

  it("保存に失敗した場合は『現在』の状態を更新せず、モーダルを開いたままにする", async () => {
    confirmAction.mockResolvedValue(true);
    updateBudgetDeclarationReminderTargetDays.mockResolvedValue({
      error: { kind: "fetchFailed", message: "更新に失敗しました。" },
    });

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    await openModal();
    fireEvent.click(screen.getByRole("checkbox", { name: "15" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(
      screen.queryByText("現在リマインドは無効です"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("リマインド無効")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "15" })).not.toBeChecked();
  });

  it("保存確認をキャンセルすると更新せず、モーダルを開いたままにする", async () => {
    confirmAction.mockResolvedValue(false);

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    await openModal();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(updateBudgetDeclarationReminderTargetDays).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("対象日を空にして保存すると、リマインド停止を案内する確認ダイアログを出し、保存後は「リマインド無効」バッジを表示する", async () => {
    confirmAction.mockResolvedValue(true);
    updateBudgetDeclarationReminderTargetDays.mockResolvedValue({});

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    await openModal();
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
    // 保存成功後は「現在」の状態が更新され、ボタン横のバッジに反映される
    await waitFor(() =>
      expect(screen.getByText("リマインド無効")).toBeInTheDocument(),
    );
    await waitForModalClosed();

    // 再度開くと「現在」の無効警告に切り替わっている
    await openModal();
    expect(screen.getByText("現在リマインドは無効です")).toBeInTheDocument();
  });

  it("保存に成功したら成功通知を表示し、モーダルを閉じる", async () => {
    confirmAction.mockResolvedValue(true);
    updateBudgetDeclarationReminderTargetDays.mockResolvedValue({});

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15, 20]} />,
    );

    await openModal();
    fireEvent.click(screen.getByRole("checkbox", { name: "18" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(updateBudgetDeclarationReminderTargetDays).toHaveBeenCalledWith([
        15, 18, 20,
      ]),
    );
    expect(notifySuccess).toHaveBeenCalled();
    await waitForModalClosed();

    // 再度開くと保存した値で初期化されている
    await openModal();
    expect(screen.getByRole("checkbox", { name: "18" })).toBeChecked();
  });

  it("保存に失敗したらエラー通知を表示する", async () => {
    confirmAction.mockResolvedValue(true);
    updateBudgetDeclarationReminderTargetDays.mockResolvedValue({
      error: { kind: "fetchFailed", message: "更新に失敗しました。" },
    });

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    await openModal();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("更新に失敗しました。"),
    );
  });

  it("キャンセルで閉じると未保存の選択を破棄し、再度開くと保存済みの値に戻っている", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15, 20]} />,
    );

    await openModal();
    fireEvent.click(screen.getByRole("checkbox", { name: "15" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "18" }));
    expect(screen.getByRole("checkbox", { name: "15" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "18" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    await waitForModalClosed();
    expect(updateBudgetDeclarationReminderTargetDays).not.toHaveBeenCalled();

    await openModal();
    expect(screen.getByRole("checkbox", { name: "15" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "18" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "20" })).toBeChecked();
  });

  it("× ボタンで閉じた場合も未保存の選択を破棄する", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    await openModal();
    fireEvent.click(screen.getByRole("checkbox", { name: "15" }));

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitForModalClosed();

    await openModal();
    expect(screen.getByRole("checkbox", { name: "15" })).toBeChecked();
  });

  it("オーバーレイのクリックで閉じた場合も未保存の選択を破棄する", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    await openModal();
    fireEvent.click(screen.getByRole("checkbox", { name: "15" }));

    clickOverlay();
    await waitForModalClosed();

    await openModal();
    expect(screen.getByRole("checkbox", { name: "15" })).toBeChecked();
  });

  it("確認ダイアログの表示中は保存ボタンを無効化し、二重に確認・保存しない", async () => {
    let resolveConfirm: (value: boolean) => void = () => {};
    confirmAction.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveConfirm = resolve;
      }),
    );

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    await openModal();
    const saveButton = screen.getByRole("button", { name: "保存" });
    fireEvent.click(saveButton);

    await waitFor(() => expect(saveButton).toBeDisabled());
    fireEvent.click(saveButton);
    expect(confirmAction).toHaveBeenCalledTimes(1);

    // 確認をキャンセルすると再び押せるようになる
    resolveConfirm(false);
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    expect(updateBudgetDeclarationReminderTargetDays).not.toHaveBeenCalled();
  });

  it("確認ダイアログの表示中はキャンセルボタンを無効化し、× ボタンを出さず、Esc・オーバーレイのクリックでも閉じない", async () => {
    let resolveConfirm: (value: boolean) => void = () => {};
    confirmAction.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveConfirm = resolve;
      }),
    );

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    await openModal();
    const cancelButton = screen.getByRole("button", { name: "キャンセル" });
    expect(cancelButton).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "閉じる" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(cancelButton).toBeDisabled());
    expect(
      screen.queryByRole("button", { name: "閉じる" }),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    clickOverlay();
    await waitLongerThanTransition();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // 確認をキャンセルすると閉じる手段が元に戻る
    resolveConfirm(false);
    await waitFor(() => expect(cancelButton).not.toBeDisabled());
    expect(screen.getByRole("button", { name: "閉じる" })).toBeInTheDocument();
  });

  it("確認ダイアログを Esc で閉じても設定モーダルは開いたまま（未保存の選択も保持）", async () => {
    // 実際の confirmAction（@mantine/modals の確認ダイアログ）を使う
    const actual = await vi.importActual<
      typeof import("@/app/utils/confirmAction")
    >("@/app/utils/confirmAction");
    confirmAction.mockImplementation(actual.confirmAction);

    renderWithMantine(
      <ModalsProvider modalProps={{ transitionProps: { duration: 0 } }}>
        <BudgetDeclarationReminderSettings initialTargetDays={[15]} />
      </ModalsProvider>,
    );

    await openModal();
    fireEvent.click(screen.getByRole("checkbox", { name: "15" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    const message = await screen.findByText(/未申告リマインドが停止します/);
    // Mantine 7.13 は開いている Modal すべてが window で Esc を拾う
    fireEvent.keyDown(message, { key: "Escape" });

    await waitFor(() =>
      expect(
        screen.queryByText(/未申告リマインドが停止します/),
      ).not.toBeInTheDocument(),
    );
    await waitLongerThanTransition();

    expect(updateBudgetDeclarationReminderTargetDays).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "15" })).not.toBeChecked();
    expect(
      screen.getByText("保存するとリマインドが無効になります"),
    ).toBeInTheDocument();
  });

  it("保存中はキャンセルボタンを無効化し、× ボタンを出さず、Esc・オーバーレイのクリックでもモーダルを閉じられない", async () => {
    confirmAction.mockResolvedValue(true);
    let resolveUpdate: (value: { error?: undefined }) => void = () => {};
    updateBudgetDeclarationReminderTargetDays.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialTargetDays={[15]} />,
    );

    await openModal();
    fireEvent.click(screen.getByRole("checkbox", { name: "18" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(updateBudgetDeclarationReminderTargetDays).toHaveBeenCalled(),
    );

    const cancelButton = screen.getByRole("button", { name: "キャンセル" });
    await waitFor(() => expect(cancelButton).toBeDisabled());
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "閉じる" }),
    ).not.toBeInTheDocument();

    fireEvent.click(cancelButton);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    clickOverlay();

    await waitLongerThanTransition();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "18" })).toBeChecked();

    // 保存が完了すると閉じる
    resolveUpdate({});
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled());
    await waitForModalClosed();
  });
});
