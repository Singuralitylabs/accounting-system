// @vitest-environment jsdom

import { ModalsProvider } from "@mantine/modals";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BudgetDeclarationReminderSettings from "@/app/components/budgetDeclarations/BudgetDeclarationReminderSettings";
import { DEFAULT_BUDGET_DECLARATION_REMINDER_MESSAGE } from "@/app/utils/budgetDeclarationReminder";
import { notifyError, notifySuccess } from "@/app/utils/notify";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const { confirmAction, updateBudgetDeclarationReminderDays } = vi.hoisted(
  () => ({
    confirmAction: vi.fn(),
    updateBudgetDeclarationReminderDays: vi.fn(),
  }),
);

vi.mock("@/app/utils/confirmAction", () => ({ confirmAction }));
vi.mock("@/app/utils/notify", () =>
  import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
);
vi.mock("@/app/utils/supabase/budgetDeclarationReminderSettings", () => ({
  updateBudgetDeclarationReminderDays,
}));

const days = (...targetDays: number[]) =>
  targetDays.map((day) => ({
    day,
    message: DEFAULT_BUDGET_DECLARATION_REMINDER_MESSAGE,
  }));

// Open the modal; Mantine's enter transition mounts it one tick late, so wait for the dialog.
const openModal = async () => {
  fireEvent.click(screen.getByRole("button", { name: "リマインド設定" }));
  await screen.findByRole("dialog");
};

// Add a day through the "日付を追加" picker.
const addDay = (day: number) => {
  fireEvent.click(screen.getByRole("button", { name: "日付を追加" }));
  fireEvent.change(screen.getByLabelText("追加する日"), {
    target: { value: String(day) },
  });
  fireEvent.click(screen.getByRole("button", { name: "追加" }));
};

const removeDay = (day: number) =>
  fireEvent.click(screen.getByRole("button", { name: `${day}日を削除` }));

const expectDayShown = (day: number) =>
  expect(screen.getByLabelText(`${day}日の文面`)).toBeInTheDocument();
const expectDayNotShown = (day: number) =>
  expect(screen.queryByLabelText(`${day}日の文面`)).not.toBeInTheDocument();

// Wait for unmount after Mantine's exit transition.
const waitForModalClosed = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

const clickOverlay = () => {
  const overlay = document.querySelector(".mantine-Modal-overlay");
  if (!overlay) throw new Error("モーダルのオーバーレイが見つかりません");
  fireEvent.mouseDown(overlay);
  fireEvent.click(overlay);
};

// If the close was accepted, unmount happens after the exit transition (default 200ms);
// wait longer than that before asserting the modal remains.
const waitLongerThanTransition = () =>
  new Promise((resolve) => setTimeout(resolve, 400));

describe("BudgetDeclarationReminderSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("初期状態ではボタンのみ表示し、設定内容は展開しない", () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    expect(
      screen.getByRole("button", { name: "リマインド設定" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expectDayNotShown(15);
  });

  it("初期取得に失敗した場合（null）もボタンは表示し、モーダル内はエラー表示のみで保存ボタンを出さない", async () => {
    renderWithMantine(<BudgetDeclarationReminderSettings initialDays={null} />);

    expect(screen.queryByText("リマインド無効")).not.toBeInTheDocument();

    await openModal();

    expect(
      screen.getByText("リマインド設定の取得に失敗しました"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "保存" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "日付を追加" }),
    ).not.toBeInTheDocument();
  });

  it("保存済みの対象日が0件のときはボタンの横に「リマインド無効」バッジを表示する", () => {
    renderWithMantine(<BudgetDeclarationReminderSettings initialDays={[]} />);

    expect(screen.getByText("リマインド無効")).toBeInTheDocument();
  });

  it("保存済みの対象日があるときは「リマインド無効」バッジを表示しない", () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    expect(screen.queryByText("リマインド無効")).not.toBeInTheDocument();
  });

  it("対象日が空のときはモーダル内で無効である旨を警告表示する", async () => {
    renderWithMantine(<BudgetDeclarationReminderSettings initialDays={[]} />);

    await openModal();

    expect(screen.getByText("現在リマインドは無効です")).toBeInTheDocument();
  });

  it("モーダルを開くと保存済みの対象日がカードで表示される", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15, 20)} />,
    );

    await openModal();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expectDayShown(15);
    expectDayShown(20);
    expectDayNotShown(18);
    expect(
      screen.queryByText("現在リマインドは無効です"),
    ).not.toBeInTheDocument();
  });

  it("保存前に全カードを削除しても『現在』の無効警告は出さず、保存時の警告のみ出す", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    await openModal();
    removeDay(15);

    expect(
      screen.queryByText("現在リマインドは無効です"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("保存するとリマインドが無効になります"),
    ).toBeInTheDocument();
    expect(screen.queryByText("リマインド無効")).not.toBeInTheDocument();
  });

  it("保存に失敗した場合は『現在』の状態を更新せず、モーダルを開いたままにする", async () => {
    confirmAction.mockResolvedValue(true);
    updateBudgetDeclarationReminderDays.mockResolvedValue({
      error: { kind: "fetchFailed", message: "更新に失敗しました。" },
    });

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    await openModal();
    removeDay(15);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(
      screen.queryByText("現在リマインドは無効です"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("リマインド無効")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expectDayNotShown(15);
  });

  it("保存確認をキャンセルすると更新せず、モーダルを開いたままにする", async () => {
    confirmAction.mockResolvedValue(false);

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    await openModal();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(updateBudgetDeclarationReminderDays).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("対象日を空にして保存すると、リマインド停止を案内する確認ダイアログを出し、保存後は「リマインド無効」バッジを表示する", async () => {
    confirmAction.mockResolvedValue(true);
    updateBudgetDeclarationReminderDays.mockResolvedValue({});

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    await openModal();
    removeDay(15);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(updateBudgetDeclarationReminderDays).toHaveBeenCalledWith([]),
    );
    expect(confirmAction).toHaveBeenCalledWith(
      expect.stringContaining("リマインドが停止します"),
    );
    expect(notifySuccess).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByText("リマインド無効")).toBeInTheDocument(),
    );
    await waitForModalClosed();

    await openModal();
    expect(screen.getByText("現在リマインドは無効です")).toBeInTheDocument();
  });

  it("保存に成功したら成功通知を表示し、モーダルを閉じる", async () => {
    confirmAction.mockResolvedValue(true);
    updateBudgetDeclarationReminderDays.mockResolvedValue({});

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15, 20)} />,
    );

    await openModal();
    addDay(18);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(updateBudgetDeclarationReminderDays).toHaveBeenCalledWith(
        days(15, 18, 20),
      ),
    );
    expect(notifySuccess).toHaveBeenCalled();
    await waitForModalClosed();

    await openModal();
    expectDayShown(18);
  });

  it("保存に失敗したらエラー通知を表示する", async () => {
    confirmAction.mockResolvedValue(true);
    updateBudgetDeclarationReminderDays.mockResolvedValue({
      error: { kind: "fetchFailed", message: "更新に失敗しました。" },
    });

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    await openModal();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("更新に失敗しました。"),
    );
  });

  it("キャンセルで閉じると未保存の編集を破棄し、再度開くと保存済みの値に戻っている", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15, 20)} />,
    );

    await openModal();
    removeDay(15);
    addDay(18);
    expectDayNotShown(15);
    expectDayShown(18);

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    await waitForModalClosed();
    expect(updateBudgetDeclarationReminderDays).not.toHaveBeenCalled();

    await openModal();
    expectDayShown(15);
    expectDayNotShown(18);
    expectDayShown(20);
  });

  it("× ボタンで閉じた場合も未保存の編集を破棄する", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    await openModal();
    removeDay(15);

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitForModalClosed();

    await openModal();
    expectDayShown(15);
  });

  it("オーバーレイのクリックで閉じた場合も未保存の編集を破棄する", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    await openModal();
    removeDay(15);

    clickOverlay();
    await waitForModalClosed();

    await openModal();
    expectDayShown(15);
  });

  it("確認ダイアログの表示中は保存ボタンを無効化し、二重に確認・保存しない", async () => {
    let resolveConfirm: (value: boolean) => void = () => {};
    confirmAction.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveConfirm = resolve;
      }),
    );

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    await openModal();
    const saveButton = screen.getByRole("button", { name: "保存" });
    fireEvent.click(saveButton);

    await waitFor(() => expect(saveButton).toBeDisabled());
    fireEvent.click(saveButton);
    expect(confirmAction).toHaveBeenCalledTimes(1);

    resolveConfirm(false);
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    expect(updateBudgetDeclarationReminderDays).not.toHaveBeenCalled();
  });

  it("確認ダイアログの表示中はキャンセルボタンを無効化し、× ボタンを出さず、Esc・オーバーレイのクリックでも閉じない", async () => {
    let resolveConfirm: (value: boolean) => void = () => {};
    confirmAction.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveConfirm = resolve;
      }),
    );

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
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

    resolveConfirm(false);
    await waitFor(() => expect(cancelButton).not.toBeDisabled());
    expect(screen.getByRole("button", { name: "閉じる" })).toBeInTheDocument();
  });

  it("確認ダイアログを Esc で閉じても設定モーダルは開いたまま（未保存の編集も保持）", async () => {
    const actual = await vi.importActual<
      typeof import("@/app/utils/confirmAction")
    >("@/app/utils/confirmAction");
    confirmAction.mockImplementation(actual.confirmAction);

    renderWithMantine(
      <ModalsProvider modalProps={{ transitionProps: { duration: 0 } }}>
        <BudgetDeclarationReminderSettings initialDays={days(15)} />
      </ModalsProvider>,
    );

    await openModal();
    removeDay(15);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    const message = await screen.findByText(/未申告リマインドが停止します/);
    // Mantine 7.13: every open Modal listens for Esc on window.
    fireEvent.keyDown(message, { key: "Escape" });

    await waitFor(() =>
      expect(
        screen.queryByText(/未申告リマインドが停止します/),
      ).not.toBeInTheDocument(),
    );
    await waitLongerThanTransition();

    expect(updateBudgetDeclarationReminderDays).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expectDayNotShown(15);
    expect(
      screen.getByText("保存するとリマインドが無効になります"),
    ).toBeInTheDocument();
  });

  it("保存中はキャンセルボタンを無効化し、× ボタンを出さず、Esc・オーバーレイのクリックでもモーダルを閉じられない", async () => {
    confirmAction.mockResolvedValue(true);
    let resolveUpdate: (value: { error?: undefined }) => void = () => {};
    updateBudgetDeclarationReminderDays.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    await openModal();
    addDay(18);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(updateBudgetDeclarationReminderDays).toHaveBeenCalled(),
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
    expectDayShown(18);

    resolveUpdate({});
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled());
    await waitForModalClosed();
  });

  it("選択した日ごとに既定文面入りの Textarea とサンプル値のプレビューを表示する", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    await openModal();

    expect(screen.getByLabelText("15日の文面")).toHaveValue(
      DEFAULT_BUDGET_DECLARATION_REMINDER_MESSAGE,
    );
    expect(screen.getByTestId("reminder-preview-15").textContent).toContain(
      "2026年10月分の事前収支申告が未申告・未完了のチームがあります。",
    );
    expect(screen.queryByLabelText("18日の文面")).not.toBeInTheDocument();
  });

  it("プレースホルダの説明は表 1 つだけで、日ごとの文面の上には出ない", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15, 20)} />,
    );

    await openModal();

    const tables = screen.getAllByTestId("slack-placeholder-table");
    expect(tables).toHaveLength(1);
    expect(tables[0]).toHaveTextContent("{month}");
    expect(tables[0]).toHaveTextContent("2026年10月");
    expect(tables[0]).toHaveTextContent("{deadline}");
    expect(
      screen.queryByText(/使用できるプレースホルダ/),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText(
        /未申告チーム・期限・URL は文面の後ろに自動で付きます/,
      ),
    ).toHaveLength(1);
  });

  it("プレビューは本文の後ろに自動付与される部分（未申告チーム・期限・URL）も続けて表示する", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    await openModal();

    const auto = screen.getByTestId("slack-preview-auto");
    expect(auto).toHaveTextContent("@Aチームリーダー Aチーム");
    expect(auto).not.toHaveTextContent("<@");
    expect(auto).toHaveTextContent("期限: 毎月20日");
    expect(auto).toHaveTextContent("https://");
  });

  it("「日付を追加」で日を追加すると既定文面入りのカードが昇順に並ぶ", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15, 20)} />,
    );

    await openModal();
    addDay(18);
    addDay(1);

    expect(screen.getByLabelText("18日の文面")).toHaveValue(
      DEFAULT_BUDGET_DECLARATION_REMINDER_MESSAGE,
    );
    const order = screen
      .getAllByTestId(/^reminder-card-/)
      .map((card) => card.getAttribute("data-testid"));
    expect(order).toEqual([
      "reminder-card-1",
      "reminder-card-15",
      "reminder-card-18",
      "reminder-card-20",
    ]);
  });

  it("使用済みの日は追加の選択肢に出ない", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15, 20)} />,
    );

    await openModal();
    fireEvent.click(screen.getByRole("button", { name: "日付を追加" }));

    const select = screen.getByLabelText("追加する日");
    const labels = Array.from(select.querySelectorAll("option")).map(
      (option) => option.textContent,
    );
    expect(labels).not.toContain("15日");
    expect(labels).not.toContain("20日");
    expect(labels).toContain("1日");
    expect(labels).toContain("31日");
    expect(screen.getByRole("button", { name: "追加" })).toBeDisabled();
  });

  it("追加の取りやめで選択 UI が閉じる", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    await openModal();
    fireEvent.click(screen.getByRole("button", { name: "日付を追加" }));
    fireEvent.click(screen.getByRole("button", { name: "やめる" }));

    expect(screen.queryByLabelText("追加する日")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "日付を追加" }),
    ).toBeInTheDocument();
  });

  it("カードの削除ボタンで日を削除でき、再追加すると既定文面から始まる", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    await openModal();
    addDay(18);
    fireEvent.change(screen.getByLabelText("18日の文面"), {
      target: { value: "本日期限です" },
    });
    removeDay(18);
    expectDayNotShown(18);

    addDay(18);
    expect(screen.getByLabelText("18日の文面")).toHaveValue(
      DEFAULT_BUDGET_DECLARATION_REMINDER_MESSAGE,
    );
  });

  it("日ごとに異なる文面を保存できる", async () => {
    confirmAction.mockResolvedValue(true);
    updateBudgetDeclarationReminderDays.mockResolvedValue({});

    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15, 20)} />,
    );

    await openModal();
    fireEvent.change(screen.getByLabelText("20日の文面"), {
      target: { value: "【本日期限】{month}分を申告してください" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(updateBudgetDeclarationReminderDays).toHaveBeenCalledWith([
        { day: 15, message: DEFAULT_BUDGET_DECLARATION_REMINDER_MESSAGE },
        { day: 20, message: "【本日期限】{month}分を申告してください" },
      ]),
    );
  });

  it("未知のプレースホルダや空の文面はエラー表示で保存できない", async () => {
    renderWithMantine(
      <BudgetDeclarationReminderSettings initialDays={days(15)} />,
    );

    await openModal();
    fireEvent.change(screen.getByLabelText("15日の文面"), {
      target: { value: "{unknown}" },
    });

    expect(screen.getByText(/使用できないプレースホルダ/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("15日の文面"), {
      target: { value: "" },
    });
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });
});
