import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendSlackNotification, notifyError, notifySuccess } = vi.hoisted(
  () => ({
    sendSlackNotification: vi.fn(),
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
  }),
);

vi.mock("@/app/actions", () => ({ sendSlackNotification }));
vi.mock("@/app/utils/notify", () => ({ notifyError, notifySuccess }));

import sendMessageToSlack from "@/app/utils/slack/sendMessageToSlack";

describe("sendMessageToSlack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("成功したら成功通知を出して true を返す", async () => {
    sendSlackNotification.mockResolvedValue({ success: true });

    expect(await sendMessageToSlack("U1", "太郎", "案件A", "m")).toBe(true);
    expect(notifySuccess).toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("利用者向けの理由（userMessage）があれば失敗通知に含める", async () => {
    sendSlackNotification.mockResolvedValue({
      error: "Slack通知を送信する権限がありません。",
      userMessage: "Slack通知を送信する権限がありません。",
    });

    expect(await sendMessageToSlack("U1", "太郎", "案件A", "m")).toBe(false);
    expect(notifyError).toHaveBeenCalledWith(
      "案件Aの通知に失敗しました（Slack通知を送信する権限がありません。）",
    );
  });

  it("内部エラー（userMessage なし）は画面に出さない", async () => {
    sendSlackNotification.mockResolvedValue({
      error: "Slack configuration is missing",
    });

    expect(await sendMessageToSlack("U1", "太郎", "案件A", "m")).toBe(false);
    expect(notifyError).toHaveBeenCalledWith("案件Aの通知に失敗しました");
  });
});
