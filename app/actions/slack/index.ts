"use server";

import {
  SlackNotificationMetadata,
  SlackNotificationResponse,
} from "@/app/types/types";

export async function sendSlackNotification(
  message: string,
  metadata?: SlackNotificationMetadata
): Promise<SlackNotificationResponse> {
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
              text: `案件に関して、経理より通達です。\n\n${message}`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: [
                  metadata?.matterTitle
                    ? `*案件:* ${metadata.matterTitle}`
                    : null,
                  metadata?.sender ? `*送信者:* ${metadata.sender}` : null,
                  `*送信日時:* ${new Date().toLocaleString("ja-JP")}`,
                ]
                  .filter(Boolean)
                  .join(" | "),
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to send Slack notification: ${response.statusText}`
      );
    }

    return { success: true };
  } catch (error) {
    console.error("Error sending Slack notification:", error);
    return { error: "Failed to send notification" };
  }
}
