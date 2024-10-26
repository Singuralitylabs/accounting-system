import { Modal, Button, Textarea } from "@mantine/core";
import { useState } from "react";
import { sendSlackNotification } from "@/app/actions";
import { notifications } from "@mantine/notifications";

export const NotificationMessage = ({
  opened,
  setOpened,
  onSendMessage,
}: {
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
  onSendMessage: (message: string) => void;
}) => {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const closeModal = () => {
    setMessage("");
    setOpened(false);
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    try {
      setIsSending(true);

      // Slack通知を送信
      const slackResult = await sendSlackNotification(message);

      if (slackResult.error) {
        throw new Error(slackResult.error);
      }

      // 親コンポーネントのコールバックを実行
      onSendMessage(message);

      notifications.show({
        title: "通知成功",
        message: "担当者への通知が完了しました",
        color: "green",
      });

      closeModal();
    } catch (error) {
      console.error("通知送信エラー:", error);
      notifications.show({
        title: "エラー",
        message: "通知の送信に失敗しました",
        color: "red",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={closeModal}
        title="案件担当者への通知内容"
      >
        <Textarea
          size="md"
          placeholder="案件担当者に通知したい内容をご記載ください。"
          value={message}
          onChange={(event) => setMessage(event.currentTarget.value)}
          disabled={isSending}
        />
        <div className="my-4 flex justify-center">
          <Button
            onClick={handleSendMessage}
            color="green"
            loading={isSending}
            disabled={!message.trim()}
          >
            担当者へ通知
          </Button>
        </div>
      </Modal>
    </>
  );
};
