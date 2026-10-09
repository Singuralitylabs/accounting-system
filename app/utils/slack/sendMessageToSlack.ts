import { sendSlackNotification } from "@/app/actions";
import { notifyError, notifySuccess } from "@/app/utils/notify";

const sendMessageToSlack = async (
  slackId: string,
  username: string,
  title: string,
  message: string,
) => {
  try {
    const slackName = slackId ? `<@${slackId}>` : username;
    const slackResult = await sendSlackNotification(message, {
      matterTitle: title,
      assignee: slackName,
    });

    if (slackResult.error) {
      throw new Error(slackResult.error);
    }
    notifySuccess("担当者への通知が完了しました", "通知成功");
    return true;
  } catch (error) {
    console.error("通知送信エラー:", error);
    // Only Japanese messages are meant for users (e.g. no permission); others are internal English errors.
    const reason =
      error instanceof Error &&
      /[\u3040-\u30ff\u4e00-\u9fff]/.test(error.message)
        ? `（${error.message}）`
        : "";
    notifyError(`${title}の通知に失敗しました${reason}`);
    return false;
  }
};

export default sendMessageToSlack;
