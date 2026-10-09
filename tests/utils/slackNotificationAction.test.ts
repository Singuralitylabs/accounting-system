import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  postSlackWebhookBlocks,
  getMatterNoticeSettingsForSend,
  getProfileInfo,
} = vi.hoisted(() => ({
  postSlackWebhookBlocks: vi.fn(),
  getMatterNoticeSettingsForSend: vi.fn(),
  getProfileInfo: vi.fn(),
}));

vi.mock("@/app/utils/slack/postSlackWebhookBlocks", () => ({
  postSlackWebhookBlocks,
}));
vi.mock("@/app/utils/supabase/slackNotificationData", () => ({
  getMatterNoticeSettingsForSend,
}));
vi.mock("@/app/utils/supabase/profiles", () => ({ getProfileInfo }));

import { sendSlackNotification } from "@/app/actions/slack";

const sectionText = () => postSlackWebhookBlocks.mock.calls[0][1][0].text.text;

describe("sendSlackNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SLACK_WEBHOOK_URL = "https://hooks.example/x";
    postSlackWebhookBlocks.mockResolvedValue({ success: true });
    getProfileInfo.mockResolvedValue({
      profileInfo: {
        name: "経理 太郎",
        class: "accounting",
        is_teamleader: false,
      },
    });
  });

  it("保存済みテンプレートを展開して送る", async () => {
    getMatterNoticeSettingsForSend.mockResolvedValue({
      header: "新ヘッダ",
      bodyTemplate: "[{matter}] {assignee} / {sender}\n{message}",
    });

    await sendSlackNotification("確認を", {
      matterTitle: "案件A",
      assignee: "<@U1>",
    });

    expect(sectionText()).toBe("新ヘッダ\n\n[案件A] <@U1> / 経理 太郎\n確認を");
  });

  it("送信者はクライアント指定ではなくセッションのプロフィールから取る", async () => {
    getMatterNoticeSettingsForSend.mockResolvedValue({
      header: "h",
      bodyTemplate: "{sender}{message}",
    });

    await sendSlackNotification("m", { sender: "なりすまし" } as never);

    expect(sectionText()).toBe("h\n\n経理 太郎m");
  });

  it("プロフィール取得に失敗したら送信しない", async () => {
    getProfileInfo.mockResolvedValue({ error: new Error("x") });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendSlackNotification("m");

    expect(result.error).toBeDefined();
    expect(postSlackWebhookBlocks).not.toHaveBeenCalled();
  });

  it.each(["public", null])(
    "経理・管理者以外（class: %s）は送信しない",
    async (userClass) => {
      getProfileInfo.mockResolvedValue({
        profileInfo: { name: "一般", class: userClass, is_teamleader: true },
      });
      vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await sendSlackNotification("m", { assignee: "<@U1>" });

      expect(result.error).toBeDefined();
      expect(postSlackWebhookBlocks).not.toHaveBeenCalled();
    },
  );

  it("管理者は送信できる", async () => {
    getProfileInfo.mockResolvedValue({
      profileInfo: { name: "管理", class: "admin", is_teamleader: false },
    });
    getMatterNoticeSettingsForSend.mockResolvedValue({
      header: "h",
      bodyTemplate: "{message}",
    });

    await sendSlackNotification("m");

    expect(postSlackWebhookBlocks).toHaveBeenCalledTimes(1);
  });

  it("本文テンプレートに {datetime} が無ければ送信日時をコンテキストに 1 回だけ出す", async () => {
    getMatterNoticeSettingsForSend.mockResolvedValue({
      header: "h",
      bodyTemplate: "{message}",
    });

    await sendSlackNotification("m");

    const blocks = postSlackWebhookBlocks.mock.calls[0][1];
    expect(blocks).toHaveLength(2);
    expect(blocks[1].elements[0].text).toMatch(/^\*送信日時:\* /);
  });

  it("本文テンプレートに {datetime} があれば送信日時を二重に出さない", async () => {
    getMatterNoticeSettingsForSend.mockResolvedValue({
      header: "h",
      bodyTemplate: "{datetime} {message}",
    });

    await sendSlackNotification("m");

    const blocks = postSlackWebhookBlocks.mock.calls[0][1];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text.text).not.toContain("{datetime}");
  });

  it("Webhook 未設定ならエラーを返し送信しない", async () => {
    delete process.env.SLACK_WEBHOOK_URL;

    const result = await sendSlackNotification("m");

    expect(result.error).toBeDefined();
    expect(postSlackWebhookBlocks).not.toHaveBeenCalled();
  });
});
