"use client";

import { Modal, Button, Textarea } from "@mantine/core";
import { useState } from "react";

export const NotificationMessage = ({
  opened,
  setOpened,
  onSendMessage,
}: {
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
  onSendMessage: (message: string) => void;
}) => {
  const [message, setMessage] = useState<string>("");

  const closeModal = () => {
    setMessage("");
    setOpened(false);
  };

  const handleSendMessage = () => {
    if (message.trim()) {
      onSendMessage(message);
      closeModal();
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
          onChange={(event) => setMessage(event.currentTarget.value)}
        />
        <div className="my-4 flex justify-center">
          <Button onClick={handleSendMessage} color="green">
            担当者へ通知
          </Button>
        </div>
      </Modal>
    </>
  );
};
