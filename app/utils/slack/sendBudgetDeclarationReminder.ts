import { SlackNotificationResponse } from "@/app/types/types";
import { postSlackWebhookBlocks } from "./postSlackWebhookBlocks";

// 未申告 Slack リマインド専用の Webhook 送信。
// app/actions/slack の sendSlackNotification は「案件に関して、経理より通達です。」という
// 案件通知専用の文言・ブロック構成を前提にしており、事前収支申告のリマインドには合わないため、
// Webhook への POST（postSlackWebhookBlocks）だけを共用し、メッセージは呼び出し側
// （buildBudgetDeclarationReminderMessage）が組み立てたテキストをそのまま送る。
export const sendBudgetDeclarationReminderToSlack = async (
  message: string,
): Promise<SlackNotificationResponse> => {
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!slackWebhookUrl) {
    console.error("Slack Webhook URL is not configured");
    return { error: "Slack configuration is missing" };
  }

  return postSlackWebhookBlocks(slackWebhookUrl, [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: message,
      },
    },
  ]);
};
