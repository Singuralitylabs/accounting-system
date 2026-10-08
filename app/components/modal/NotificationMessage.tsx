import { Button, Group, Modal, Tabs, Text, Textarea } from "@mantine/core";
import { useState } from "react";
import SlackNotificationSettings from "../matterList/SlackNotificationSettings";

type Props = {
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
  // Resolves true only when the message was actually sent; otherwise the draft and modal stay.
  onSendMessage: (message: string) => Promise<boolean>;
  // Display-only SLACK_CHANNEL_NAME; the real destination is decided by the webhook.
  channelName?: string;
};

// One modal for "担当者に連絡": the "送信" tab sends the message, the "文面の設定" tab edits the
// template (admin / accounting only; the page is already restricted to them).
export const NotificationMessage = ({
  opened,
  setOpened,
  onSendMessage,
  channelName,
}: Props) => {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  // Saving or confirming in the settings tab; reported by the panel.
  const [isSettingsBusy, setIsSettingsBusy] = useState(false);
  const [tab, setTab] = useState<string | null>("send");
  // Mount the settings panel on first visit (avoids fetching when only sending), then keep it
  // mounted so its unsaved draft survives tab switches.
  const [settingsVisited, setSettingsVisited] = useState(false);

  const handleTabChange = (value: string | null) => {
    if (value === "settings") setSettingsVisited(true);
    setTab(value);
  };

  const isBusy = isSending || isSettingsBusy;

  const closeModal = () => {
    // Esc / overlay / × are disabled while busy; guard anyway so a draft is never dropped mid-save.
    if (isBusy) return;
    setMessage("");
    setOpened(false);
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    try {
      setIsSending(true);
      const sent = await onSendMessage(message);
      if (!sent) return;
      setMessage("");
      setOpened(false);
    } catch (error) {
      console.error("通知送信エラー:", error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={closeModal}
      title={
        <Group gap="xs" align="baseline">
          <Text fw={600}>担当者に連絡</Text>
          {channelName && (
            <Text size="sm" c="dimmed" data-testid="slack-channel-name">
              投稿先: {channelName}
            </Text>
          )}
        </Group>
      }
      size="lg"
      withCloseButton={!isBusy}
      closeOnEscape={!isBusy}
      closeOnClickOutside={!isBusy}
      closeButtonProps={{ "aria-label": "閉じる" }}
    >
      <Tabs value={tab} onChange={handleTabChange}>
        <Tabs.List mb="md">
          <Tabs.Tab value="send" disabled={isBusy}>
            送信
          </Tabs.Tab>
          <Tabs.Tab value="settings" disabled={isBusy}>
            文面の設定
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="send">
          <Textarea
            size="md"
            placeholder="案件担当者に通知したい内容をご記載ください。"
            value={message}
            onChange={(event) => setMessage(event.currentTarget.value)}
            disabled={isSending}
            autosize
            minRows={4}
          />
          <div className="my-4 flex justify-center">
            <Button
              onClick={handleSendMessage}
              color="indigo"
              loading={isSending}
              disabled={!message.trim()}
            >
              slack通知
            </Button>
          </div>
        </Tabs.Panel>
        <Tabs.Panel value="settings">
          {settingsVisited && (
            <SlackNotificationSettings onBusyChange={setIsSettingsBusy} />
          )}
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
};
