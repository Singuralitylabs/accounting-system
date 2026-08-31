"use server";

import {
  SlackNotificationMetadata,
  SlackNotificationResponse,
} from "@/app/types/types";
import { postSlackWebhookBlocks } from "@/app/utils/slack/postSlackWebhookBlocks";

export async function sendSlackNotification(
  message: string,
  metadata?: SlackNotificationMetadata,
): Promise<SlackNotificationResponse> {
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
        text: `案件に関して、経理より通達です。\n\n${message}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: [
            metadata?.matterTitle ? `*案件:* ${metadata.matterTitle}` : null,
            metadata?.sender ? `*送信者:* ${metadata.sender}` : null,
            `*送信日時:* ${new Date().toLocaleString("ja-JP")}`,
          ]
            .filter(Boolean)
            .join(" | "),
        },
      ],
    },
  ]);
}
