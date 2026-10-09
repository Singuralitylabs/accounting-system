import { sendSlackNotification } from "@/app/actions";
import { notifyError, notifySuccess } from "@/app/utils/notify";

const sendMessageToSlack = async (
  slackId: string,
  username: string,
  title: string,
  message: string,
) => {
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
    return true;
  } catch (error) {
    console.error("通知送信エラー:", error);
    notifyError(
      `${title}の通知に失敗しました${userMessage ? `（${userMessage}）` : ""}`,
    );
    return false;
  }
};

export default sendMessageToSlack;
