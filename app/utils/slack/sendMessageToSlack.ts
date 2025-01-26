import { sendSlackNotification } from "@/app/actions";
import { notifications } from "@mantine/notifications";

const sendMessageToSlack = async (
  slackId: string,
  username: string,
  title: string,
  message: string
) => {
  try {
    const slackName = slackId ? `<@${slackId}>` : username;
    const body = `案件：${title}\n` + `担当者：${slackName}\n` + message;
    const slackResult = await sendSlackNotification(body);

    if (slackResult.error) {
      throw new Error(slackResult.error);
    }
    notifications.show({
      title: "通知成功",
      message: "担当者への通知が完了しました",
      color: "green",
    });
  } catch (error) {
    console.error("通知送信エラー:", error);
    notifications.show({
      title: "エラー",
      message: `${title}の通知に失敗しました`,
      color: "red",
    });
    return false;
  }
};

export default sendMessageToSlack;
