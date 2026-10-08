// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { NotificationMessage } from "@/app/components/modal/NotificationMessage";
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

const onSendMessage = vi.fn();

const Harness = ({ channelName }: { channelName?: string }) => {
  const [opened, setOpened] = useState(true);
  return opened ? (
    <NotificationMessage
      opened={opened}
      setOpened={setOpened}
      onSendMessage={onSendMessage}
      channelName={channelName}
    />
  ) : (
    <div>closed</div>
  );
};

const waitLongerThanTransition = () =>
  new Promise((resolve) => setTimeout(resolve, 400));

describe("NotificationMessage（担当者に連絡モーダル）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSlackNotificationSettings.mockResolvedValue({ settings });
    updateSlackNotificationSettings.mockResolvedValue({});
    confirmAction.mockResolvedValue(true);
    onSendMessage.mockResolvedValue(true);
  });

  it("「送信」と「文面の設定」のタブがあり、既定は送信タブ", async () => {
    renderWithMantine(<Harness />);

    expect(await screen.findByRole("tab", { name: "送信" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "文面の設定" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(
      screen.getByPlaceholderText(
        "案件担当者に通知したい内容をご記載ください。",
      ),
    ).toBeInTheDocument();
  });

  it("投稿先チャンネル名をタイトルに表示し、未設定なら表示しない", async () => {
    const { unmount } = renderWithMantine(<Harness channelName="#経理連絡" />);
    expect(await screen.findByTestId("slack-channel-name")).toHaveTextContent(
      "#経理連絡",
    );
    unmount();

    renderWithMantine(<Harness />);
    await screen.findByRole("tab", { name: "送信" });
    expect(screen.queryByTestId("slack-channel-name")).not.toBeInTheDocument();
  });

  it("「投稿先チャンネルは変更できません。」の記述が残っていない", async () => {
    renderWithMantine(<Harness channelName="#経理連絡" />);
    fireEvent.click(await screen.findByRole("tab", { name: "文面の設定" }));
    await screen.findByDisplayValue("ヘッダ");

    expect(
      screen.queryByText(/投稿先チャンネルは変更できません/),
    ).not.toBeInTheDocument();
  });

  it("送信タブでメッセージを送ると onSendMessage を呼んでモーダルを閉じる", async () => {
    renderWithMantine(<Harness />);

    fireEvent.change(
      await screen.findByPlaceholderText(
        "案件担当者に通知したい内容をご記載ください。",
      ),
      { target: { value: "確認してください" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "slack通知" }));

    await waitFor(() =>
      expect(onSendMessage).toHaveBeenCalledWith("確認してください"),
    );
    await screen.findByText("closed");
  });

  it("送信されなかった場合はモーダルを閉じず、入力したメッセージと未保存の編集を保持する", async () => {
    onSendMessage.mockResolvedValue(false);
    renderWithMantine(<Harness />);

    const textarea = await screen.findByPlaceholderText(
      "案件担当者に通知したい内容をご記載ください。",
    );
    fireEvent.change(textarea, { target: { value: "送れなかった" } });
    fireEvent.click(screen.getByRole("tab", { name: "文面の設定" }));
    fireEvent.change(await screen.findByDisplayValue("ヘッダ"), {
      target: { value: "編集中" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "送信" }));
    fireEvent.click(screen.getByRole("button", { name: "slack通知" }));

    await waitFor(() =>
      expect(onSendMessage).toHaveBeenCalledWith("送れなかった"),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "slack通知" }),
      ).not.toHaveAttribute("data-loading"),
    );
    expect(screen.queryByText("closed")).not.toBeInTheDocument();
    expect(textarea).toHaveValue("送れなかった");
    fireEvent.click(screen.getByRole("tab", { name: "文面の設定" }));
    expect(screen.getByLabelText("ヘッダ")).toHaveValue("編集中");
  });

  it("文面の設定タブを開くまで文面の設定を取得しない", async () => {
    renderWithMantine(<Harness />);
    await screen.findByRole("tab", { name: "送信" });
    await waitLongerThanTransition();
    expect(getSlackNotificationSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "文面の設定" }));
    expect(await screen.findByDisplayValue("ヘッダ")).toBeInTheDocument();
    expect(getSlackNotificationSettings).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: "送信" }));
    fireEvent.click(screen.getByRole("tab", { name: "文面の設定" }));
    expect(getSlackNotificationSettings).toHaveBeenCalledTimes(1);
  });

  it("文面の設定タブで保存でき、タブを切り替えても未送信のメッセージと未保存の編集を保持する", async () => {
    renderWithMantine(<Harness />);

    const textarea = await screen.findByPlaceholderText(
      "案件担当者に通知したい内容をご記載ください。",
    );
    fireEvent.change(textarea, { target: { value: "書きかけ" } });

    fireEvent.click(screen.getByRole("tab", { name: "文面の設定" }));
    const header = await screen.findByDisplayValue("ヘッダ");
    fireEvent.change(header, { target: { value: "新ヘッダ" } });

    fireEvent.click(screen.getByRole("tab", { name: "送信" }));
    expect(textarea).toHaveValue("書きかけ");
    fireEvent.click(screen.getByRole("tab", { name: "文面の設定" }));
    expect(screen.getByLabelText("ヘッダ")).toHaveValue("新ヘッダ");

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(updateSlackNotificationSettings).toHaveBeenCalledWith({
        header: "新ヘッダ",
        bodyTemplate: settings.bodyTemplate,
      }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("モーダルを閉じると未保存の編集を破棄し、開き直すと保存済みの内容に戻る", async () => {
    const { unmount } = renderWithMantine(<Harness />);
    fireEvent.click(await screen.findByRole("tab", { name: "文面の設定" }));
    fireEvent.change(await screen.findByDisplayValue("ヘッダ"), {
      target: { value: "破棄される" },
    });
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await screen.findByText("closed");
    unmount();

    renderWithMantine(<Harness />);
    fireEvent.click(await screen.findByRole("tab", { name: "文面の設定" }));
    expect(await screen.findByDisplayValue("ヘッダ")).toBeInTheDocument();
  });

  it("案件を選択していなくても文面の設定タブは使える（送信先が 0 件でもタブ切り替え・保存できる）", async () => {
    renderWithMantine(<Harness />);
    fireEvent.click(await screen.findByRole("tab", { name: "文面の設定" }));

    expect(await screen.findByDisplayValue("ヘッダ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).not.toBeDisabled();
  });

  it("保存の確認中はタブ切り替え・閉じる操作ができない", async () => {
    let resolveConfirm: (value: boolean) => void = () => {};
    confirmAction.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveConfirm = resolve;
      }),
    );
    renderWithMantine(<Harness />);
    fireEvent.click(await screen.findByRole("tab", { name: "文面の設定" }));
    await screen.findByDisplayValue("ヘッダ");

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "送信" })).toBeDisabled(),
    );
    expect(
      screen.queryByRole("button", { name: "閉じる" }),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    const overlay = document.querySelector(".mantine-Modal-overlay");
    if (!overlay) throw new Error("overlay not found");
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);
    await waitLongerThanTransition();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    resolveConfirm(false);
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "送信" })).not.toBeDisabled(),
    );
    expect(screen.getByLabelText("ヘッダ")).toHaveValue("ヘッダ");
  });

  it("送信中は閉じる操作ができず、完了後に閉じる", async () => {
    let resolveSend: (sent: boolean) => void = () => {};
    onSendMessage.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveSend = resolve;
      }),
    );
    renderWithMantine(<Harness />);

    fireEvent.change(
      await screen.findByPlaceholderText(
        "案件担当者に通知したい内容をご記載ください。",
      ),
      { target: { value: "送信します" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "slack通知" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "閉じる" }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitLongerThanTransition();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    resolveSend(true);
    await screen.findByText("closed");
  });
});
