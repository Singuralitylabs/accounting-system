import { SlackNotificationResponse } from "@/app/types/types";

// Shared Slack Incoming Webhook POST (blocks payload only); callers build the content.
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
      // Include status code and body: statusText alone hides Slack's reason (invalid_payload / channel_not_found).
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
