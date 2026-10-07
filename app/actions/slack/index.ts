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

  const [settings, { profileInfo, error: profileError }] = await Promise.all([
    getMatterNoticeSettingsForSend(),
    getProfileInfo(),
  ]);
  // Sender comes from the verified session, not from client-supplied metadata (which could be spoofed).
  if (profileError) {
    console.error("Slack通知の送信者の取得に失敗しました:", profileError);
  }
  const sender = profileInfo?.name ?? "（不明）";
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
          text: [`*送信日時:* ${sentAt}`].filter(Boolean).join(" | "),
        },
      ],
    },
  ]);
}
