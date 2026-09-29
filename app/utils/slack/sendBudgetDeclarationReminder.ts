import { SlackNotificationResponse } from "@/app/types/types";
import { postSlackWebhookBlocks } from "./postSlackWebhookBlocks";

// sendSlackNotification's wording/blocks are specific to matter notices, so only the webhook POST is
// shared and the message text comes from buildBudgetDeclarationReminderMessage.
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
