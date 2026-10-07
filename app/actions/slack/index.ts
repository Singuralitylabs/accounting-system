"use server";

import {
  SlackNotificationMetadata,
  SlackNotificationResponse,
} from "@/app/types/types";
import { postSlackWebhookBlocks } from "@/app/utils/slack/postSlackWebhookBlocks";
import { buildMatterNoticeText } from "@/app/utils/slackNotificationTemplate";
import { getProfileInfo } from "@/app/utils/supabase/profiles";
import { getMatterNoticeSettingsForSend } from "@/app/utils/supabase/slackNotificationData";

export async function sendSlackNotification(
  message: string,
  metadata?: SlackNotificationMetadata,
): Promise<SlackNotificationResponse> {
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!slackWebhookUrl) {
    console.error("Slack Webhook URL is not configured");
    return { error: "Slack configuration is missing" };
  }

  const [settings, { profileInfo }] = await Promise.all([
    getMatterNoticeSettingsForSend(),
    getProfileInfo(),
  ]);
  // Sender comes from the verified session, not from client-supplied metadata (which could be spoofed).
  const sender = profileInfo?.name ?? "";
  const sentAt = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const text = buildMatterNoticeText(settings, {
    matter: metadata?.matterTitle ?? "",
    assignee: metadata?.assignee ?? "",
    message,
    sender,
    datetime: sentAt,
  });

  return postSlackWebhookBlocks(slackWebhookUrl, [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: [
            metadata?.matterTitle ? `*案件:* ${metadata.matterTitle}` : null,
            sender ? `*送信者:* ${sender}` : null,
            `*送信日時:* ${sentAt}`,
          ]
            .filter(Boolean)
            .join(" | "),
        },
      ],
    },
  ]);
}
