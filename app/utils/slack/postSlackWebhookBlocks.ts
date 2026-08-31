import { SlackNotificationResponse } from "@/app/types/types";

// Slack Incoming Webhook への POST 共通処理（blocks 形式のペイロードのみ）。
// メッセージ内容・ブロック構成の組み立ては呼び出し側の責務とし、ここでは
// fetch とエラーハンドリングだけを担う（app/actions/slack/index.ts の
// sendSlackNotification と app/utils/slack/sendBudgetDeclarationReminder.ts で共用）。
export const postSlackWebhookBlocks = async (
  webhookUrl: string,
  blocks: unknown[],
): Promise<SlackNotificationResponse> => {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ blocks }),
    });

    if (!response.ok) {
      // statusText だけでは Slack 側の失敗理由（invalid_payload / channel_not_found 等）が
      // 追えないため、ステータスコードとレスポンス本文も含めて調査しやすくする
      const body = await response.text();
      throw new Error(
        `Failed to send Slack notification: ${response.status} ${response.statusText} ${body}`,
      );
    }

    return { success: true };
  } catch (error) {
    console.error("Error sending Slack notification:", error);
    return { error: "Failed to send notification" };
  }
};
