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

  it("成功したら成功通知を出して sent を返す", async () => {
    sendSlackNotification.mockResolvedValue({ success: true });

    expect(await sendMessageToSlack("U1", "太郎", "案件A", "m")).toEqual({
      status: "sent",
    });
    expect(notifySuccess).toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("中止理由（abortReason）があれば aborted と理由を返し、案件ごとのトーストは出さない", async () => {
    sendSlackNotification.mockResolvedValue({
      error: "Slack通知を送信する権限がありません。",
      abortReason: "Slack通知を送信する権限がありません。",
    });

    expect(await sendMessageToSlack("U1", "太郎", "案件A", "m")).toEqual({
      status: "aborted",
      reason: "Slack通知を送信する権限がありません。",
    });
    expect(notifyError).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it("案件固有の失敗（abortReason なし）は failed を返し、案件名付きのトーストを出す", async () => {
    sendSlackNotification.mockResolvedValue({
      error: "Failed to send notification",
    });

    expect(await sendMessageToSlack("U1", "太郎", "案件A", "m")).toEqual({
      status: "failed",
    });
    expect(notifyError).toHaveBeenCalledWith("案件Aの通知に失敗しました");
  });
});
