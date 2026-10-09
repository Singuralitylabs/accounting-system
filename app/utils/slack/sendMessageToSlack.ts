import { sendSlackNotification } from "@/app/actions";
import { notifyError, notifySuccess } from "@/app/utils/notify";

// "aborted": the failure is not specific to this matter (e.g. no permission), so callers should stop
// sending and report the reason once instead of toasting per matter.
export type SendMessageResult =
  | { status: "sent" }
  | { status: "failed" }
  | { status: "aborted"; reason: string };

const sendMessageToSlack = async (
  slackId: string,
  username: string,
  title: string,
  message: string,
): Promise<SendMessageResult> => {
  try {
    const slackName = slackId ? `<@${slackId}>` : username;
    const slackResult = await sendSlackNotification(message, {
      matterTitle: title,
      assignee: slackName,
    });

    if (slackResult.abortReason) {
      console.error("通知送信を中止:", slackResult.error);
      return { status: "aborted", reason: slackResult.abortReason };
    }
    if (slackResult.error) {
      throw new Error(slackResult.error);
    }
    notifySuccess("担当者への通知が完了しました", "通知成功");
    return { status: "sent" };
  } catch (error) {
    console.error("通知送信エラー:", error);
    notifyError(`${title}の通知に失敗しました`);
    return { status: "failed" };
  }
};

export default sendMessageToSlack;
