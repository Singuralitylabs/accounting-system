import { sendSlackNotification } from "@/app/actions";
import { notifyError, notifySuccess } from "@/app/utils/notify";

// "aborted": the failure is not specific to this matter (e.g. no permission), so callers should stop sending.
export type SendMessageResult = "sent" | "failed" | "aborted";

const sendMessageToSlack = async (
  slackId: string,
  username: string,
  title: string,
  message: string,
): Promise<SendMessageResult> => {
  let userMessage: string | undefined;
  try {
    const slackName = slackId ? `<@${slackId}>` : username;
    const slackResult = await sendSlackNotification(message, {
      matterTitle: title,
      assignee: slackName,
    });

    if (slackResult.error) {
      userMessage = slackResult.userMessage;
      throw new Error(slackResult.error);
    }
    notifySuccess("担当者への通知が完了しました", "通知成功");
    return "sent";
  } catch (error) {
    console.error("通知送信エラー:", error);
    notifyError(
      `${title}の通知に失敗しました${userMessage ? `（${userMessage}）` : ""}`,
    );
    return userMessage ? "aborted" : "failed";
  }
};

export default sendMessageToSlack;
