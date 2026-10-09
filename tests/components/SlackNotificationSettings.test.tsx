// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SlackNotificationSettings from "@/app/components/matterList/SlackNotificationSettings";
import { notifyError, notifySuccess } from "@/app/utils/notify";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const {
  confirmAction,
  getSlackNotificationSettings,
  updateSlackNotificationSettings,
} = vi.hoisted(() => ({
  confirmAction: vi.fn(),
  getSlackNotificationSettings: vi.fn(),
  updateSlackNotificationSettings: vi.fn(),
}));

vi.mock("@/app/utils/confirmAction", () => ({ confirmAction }));
vi.mock("@/app/utils/notify", () =>
  import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
);
vi.mock("@/app/utils/supabase/slackNotificationSettings", () => ({
  getSlackNotificationSettings,
  updateSlackNotificationSettings,
}));

const settings = {
  header: "ヘッダ",
  bodyTemplate: "案件：{matter}\n{assignee}\n{message}",
};

const onBusyChange = vi.fn();

const renderPanel = async () => {
  renderWithMantine(<SlackNotificationSettings onBusyChange={onBusyChange} />);
  await screen.findByDisplayValue("ヘッダ");
};

describe("SlackNotificationSettings（文面の設定）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSlackNotificationSettings.mockResolvedValue({ settings });
    updateSlackNotificationSettings.mockResolvedValue({});
    confirmAction.mockResolvedValue(true);
  });

  it("開くと現在の設定とサンプル値のプレビューが表示される", async () => {
    await renderPanel();

    expect(screen.getByLabelText("本文テンプレート")).toHaveValue(
      "案件：{matter}\n{assignee}\n{message}",
    );
    expect(screen.getByTestId("slack-template-preview").textContent).toBe(
      "ヘッダ\n\n案件：サンプル案件\n@担当者\nご確認をお願いします。",
    );
  });

  it("プレースホルダの説明は意味と例を持つ表 1 つで、必須の印が付く", async () => {
    await renderPanel();

    const table = screen.getByTestId("slack-placeholder-table");
    expect(table).toHaveTextContent("{matter}");
    expect(table).toHaveTextContent("サンプル案件");
    expect(table).toHaveTextContent("送信時に入力したメッセージ（必須）");
    expect(screen.getAllByTestId("slack-placeholder-table")).toHaveLength(1);
  });

  it("確認後に編集内容を保存する", async () => {
    await renderPanel();

    fireEvent.change(screen.getByLabelText("ヘッダ"), {
      target: { value: "新ヘッダ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(updateSlackNotificationSettings).toHaveBeenCalledWith({
        header: "新ヘッダ",
        bodyTemplate: settings.bodyTemplate,
      }),
    );
    expect(notifySuccess).toHaveBeenCalled();
    expect(screen.getByLabelText("ヘッダ")).toHaveValue("新ヘッダ");
  });

  it("確認ダイアログでキャンセルすると保存しない", async () => {
    confirmAction.mockResolvedValue(false);
    await renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(updateSlackNotificationSettings).not.toHaveBeenCalled();
  });

  it("{message} を消すとエラー表示で保存ボタンが無効になる", async () => {
    await renderPanel();

    fireEvent.change(screen.getByLabelText("本文テンプレート"), {
      target: { value: "案件：{matter}" },
    });

    expect(screen.getByText(/を含めてください/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("保存失敗時はエラー通知して編集内容を残す", async () => {
    updateSlackNotificationSettings.mockResolvedValue({
      error: { kind: "fetchFailed", message: "失敗しました" },
    });
    await renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("失敗しました"),
    );
    expect(screen.getByLabelText("ヘッダ")).toBeInTheDocument();
  });

  it("保存中・確認中は busy を親に通知する", async () => {
    let resolveConfirm: (value: boolean) => void = () => {};
    confirmAction.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveConfirm = resolve;
      }),
    );
    await renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true));

    resolveConfirm(false);
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
  });

  it("取得に失敗したらエラーを表示する", async () => {
    getSlackNotificationSettings.mockResolvedValue({
      error: { kind: "fetchFailed", message: "x" },
    });
    renderWithMantine(
      <SlackNotificationSettings onBusyChange={onBusyChange} />,
    );

    expect(
      await screen.findByText("Slack通知設定の取得に失敗しました"),
    ).toBeInTheDocument();
  });
});
