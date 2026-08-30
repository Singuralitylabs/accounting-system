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
    const body = `案件：${title}\n` + `担当者：${slackName}\n` + message;
    const slackResult = await sendSlackNotification(body);

    if (slackResult.error) {
      throw new Error(slackResult.error);
    }
    notifySuccess("担当者への通知が完了しました", "通知成功");
    return true; // 成功時にtrueを返す
  } catch (error) {
    console.error("通知送信エラー:", error);
    notifyError(`${title}の通知に失敗しました`);
    return false;
  }
};

export default sendMessageToSlack;
