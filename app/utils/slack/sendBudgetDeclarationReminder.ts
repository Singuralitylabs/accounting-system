import { SlackNotificationResponse } from "@/app/types/types";

// 未申告 Slack リマインド専用の Webhook 送信。
// app/actions/slack の sendSlackNotification は「案件に関して、経理より通達です。」という
// 案件通知専用の文言・ブロック構成を前提にしており、事前収支申告のリマインドには合わないため、
// SLACK_WEBHOOK_URL への POST だけを流用し、メッセージは呼び出し側
// （buildBudgetDeclarationReminderMessage）が組み立てたテキストをそのまま送る。
export const sendBudgetDeclarationReminderToSlack = async (
  message: string,
): Promise<SlackNotificationResponse> => {
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!slackWebhookUrl) {
    console.error("Slack Webhook URL is not configured");
    return { error: "Slack configuration is missing" };
  }

  try {
    const response = await fetch(slackWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: message,
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to send Slack notification: ${response.statusText}`,
      );
    }

    return { success: true };
  } catch (error) {
    console.error("事前収支申告リマインドの Slack 通知に失敗しました:", error);
    return { error: "Failed to send notification" };
  }
};
