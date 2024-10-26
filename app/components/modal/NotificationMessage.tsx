import { Modal, Button, Textarea } from "@mantine/core";

export const NotificationMessage = ({
  opened,
  setOpened,
}: {
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const closeModal = () => {
    setOpened(false);
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
        />
        <div className="my-4 flex justify-center">
          <Button color="green">担当者へ通知</Button>
        </div>
      </Modal>
    </>
  );
};
