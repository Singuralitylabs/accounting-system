"use server";

import {
  SlackNotificationMetadata,
  SlackNotificationResponse,
} from "@/app/types/types";
import { postSlackWebhookBlocks } from "@/app/utils/slack/postSlackWebhookBlocks";
import { buildMatterNoticeText } from "@/app/utils/slackNotificationTemplate";
import { ACCOUNTING_ROLES } from "@/app/utils/permissions";
import { getMatterNoticeSettingsForSend } from "@/app/utils/supabase/slackNotificationData";
import { getAuthorizedViewer } from "@/app/utils/supabase/viewerAccess";

export async function sendSlackNotification(
  message: string,
  metadata?: SlackNotificationMetadata,
): Promise<SlackNotificationResponse> {
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!slackWebhookUrl) {
    console.error("Slack Webhook URL is not configured");
    return { error: "Slack configuration is missing" };
  }

  // Server Actions are callable by any logged-in user, so check the role here; the sender is taken from
  // the verified session, not from client-supplied metadata (which could be spoofed).
  const { profileInfo, error: accessError } = await getAuthorizedViewer(
    ACCOUNTING_ROLES,
    "Slack通知",
  );
  if (accessError) {
    return {
      error:
        accessError.kind === "forbidden"
          ? "Slack通知を送信する権限がありません。"
          : "Slack通知の送信者を確認できませんでした。",
    };
  }
  const settings = await getMatterNoticeSettingsForSend();
  const sender = profileInfo.name;
  const sentAt = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const text = buildMatterNoticeText(settings, {
    matter: metadata?.matterTitle ?? "",
    assignee: metadata?.assignee ?? "",
    message,
    sender,
    datetime: sentAt,
  });

  const blocks: Parameters<typeof postSlackWebhookBlocks>[1] = [
    { type: "section", text: { type: "mrkdwn", text } },
  ];
  // Show the sent time once: only add the footer when the template does not already place {datetime}.
  if (!settings.bodyTemplate.includes("{datetime}")) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `*送信日時:* ${sentAt}` }],
    });
  }

  return postSlackWebhookBlocks(slackWebhookUrl, blocks);
}
