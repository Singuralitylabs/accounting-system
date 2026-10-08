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

const openModal = async () => {
  fireEvent.click(screen.getByRole("button", { name: "通知設定" }));
  await screen.findByRole("dialog");
  await screen.findByDisplayValue("ヘッダ");
};

describe("SlackNotificationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSlackNotificationSettings.mockResolvedValue({ settings });
    updateSlackNotificationSettings.mockResolvedValue({});
    confirmAction.mockResolvedValue(true);
  });

  it("開くと現在の設定とサンプル値のプレビューが表示される", async () => {
    renderWithMantine(<SlackNotificationSettings />);
    await openModal();

    expect(screen.getByLabelText("本文テンプレート")).toHaveValue(
      "案件：{matter}\n{assignee}\n{message}",
    );
    expect(screen.getByTestId("slack-template-preview").textContent).toBe(
      "ヘッダ\n\n案件：サンプル案件\n@担当者\nご確認をお願いします。",
    );
  });

  it("確認後に編集内容を保存する", async () => {
    renderWithMantine(<SlackNotificationSettings />);
    await openModal();

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
  });

  it("確認ダイアログでキャンセルすると保存しない", async () => {
    confirmAction.mockResolvedValue(false);
    renderWithMantine(<SlackNotificationSettings />);
    await openModal();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(updateSlackNotificationSettings).not.toHaveBeenCalled();
  });

  it("{message} を消すとエラー表示で保存ボタンが無効になる", async () => {
    renderWithMantine(<SlackNotificationSettings />);
    await openModal();

    fireEvent.change(screen.getByLabelText("本文テンプレート"), {
      target: { value: "案件：{matter}" },
    });

    expect(screen.getByText(/を含めてください/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("保存失敗時はエラー通知してモーダルを開いたままにする", async () => {
    updateSlackNotificationSettings.mockResolvedValue({
      error: { kind: "fetchFailed", message: "失敗しました" },
    });
    renderWithMantine(<SlackNotificationSettings />);
    await openModal();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("失敗しました"),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("取得に失敗したらエラーを表示する", async () => {
    getSlackNotificationSettings.mockResolvedValue({
      error: { kind: "fetchFailed", message: "x" },
    });
    renderWithMantine(<SlackNotificationSettings />);
    fireEvent.click(screen.getByRole("button", { name: "通知設定" }));

    expect(
      await screen.findByText("Slack通知設定の取得に失敗しました"),
    ).toBeInTheDocument();
  });
});
