"use client";

import {
  Alert,
  Button,
  Code,
  LoadingOverlay,
  Modal,
  Table,
  Text,
  Textarea,
} from "@mantine/core";
import { useState } from "react";
import {
  MATTER_NOTICE_PLACEHOLDERS,
  MATTER_NOTICE_REQUIRED_KEYS,
  MatterNoticeSettings,
  buildMatterNoticeText,
  validateMatterNoticeSettings,
} from "@/app/utils/slackNotificationTemplate";
import { sampleValues } from "@/app/utils/slackTemplate";
import { confirmAction } from "@/app/utils/confirmAction";
import { notifyError, notifySuccess } from "@/app/utils/notify";
import {
  getSlackNotificationSettings,
  updateSlackNotificationSettings,
} from "@/app/utils/supabase/slackNotificationSettings";

const EMPTY: MatterNoticeSettings = { header: "", bodyTemplate: "" };

// Settings button and modal for the matter notice template; rendered for admin / accounting only (the page itself is restricted).
const SlackNotificationSettings = () => {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<MatterNoticeSettings>(EMPTY);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // True while the confirm dialog is shown: Esc would otherwise close this modal and discard the draft.
  const [isConfirming, setIsConfirming] = useState(false);

  const isBusy = isLoading || isConfirming;
  const validationError = validateMatterNoticeSettings(draft);

  const openModal = async () => {
    setOpened(true);
    setLoadFailed(false);
    setIsLoading(true);
    try {
      const { settings, error } = await getSlackNotificationSettings();
      if (error || !settings) {
        setLoadFailed(true);
        return;
      }
      setDraft(settings);
    } catch (error) {
      console.error("Slack通知設定の取得に失敗しました。", error);
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    if (isBusy) return;
    setOpened(false);
  };

  const handleSave = async () => {
    if (validationError) return;

    let confirmed: boolean;
    try {
      setIsConfirming(true);
      confirmed = await confirmAction("Slack通知の定型文を更新しますか？");
    } finally {
      setIsConfirming(false);
    }
    if (!confirmed) return;

    try {
      setIsLoading(true);
      const { error } = await updateSlackNotificationSettings(draft);
      if (error) {
        notifyError(error.message);
        return;
      }
      notifySuccess("Slack通知設定を更新しました。");
      setOpened(false);
    } catch (error) {
      console.error("Slack通知設定の保存に失敗しました。", error);
      notifyError("Slack通知設定の保存に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  };

  const preview = validationError
    ? null
    : buildMatterNoticeText(draft, {
        matter: "",
        assignee: "",
        message: "",
        sender: "",
        datetime: "",
        ...sampleValues(MATTER_NOTICE_PLACEHOLDERS),
      });

  return (
    <>
      <Button type="button" variant="light" color="indigo" onClick={openModal}>
        通知設定
      </Button>
      <Modal
        opened={opened}
        onClose={closeModal}
        title="Slack通知設定"
        size="lg"
        withCloseButton={!isBusy}
        closeOnEscape={!isBusy}
        closeOnClickOutside={!isBusy}
        closeButtonProps={{ "aria-label": "閉じる" }}
      >
        {loadFailed ? (
          <Alert color="red" title="Slack通知設定の取得に失敗しました">
            時間をおいて再度開いてください。
          </Alert>
        ) : (
          <div className="relative">
            <LoadingOverlay visible={isLoading} />
            <Text size="sm" c="dimmed" mb="xs">
              「担当者に連絡」で送る Slack
              メッセージの定型文です。投稿先チャンネルは変更できません。
            </Text>
            <Textarea
              label="ヘッダ"
              value={draft.header}
              onChange={(event) =>
                setDraft({ ...draft, header: event.currentTarget.value })
              }
              autosize
              minRows={1}
              mb="sm"
            />
            <Textarea
              label="本文テンプレート"
              value={draft.bodyTemplate}
              onChange={(event) =>
                setDraft({ ...draft, bodyTemplate: event.currentTarget.value })
              }
              autosize
              minRows={4}
              mb="xs"
            />
            <Table withTableBorder mb="sm" fz="xs">
              <Table.Tbody>
                {MATTER_NOTICE_PLACEHOLDERS.map(({ key, description }) => (
                  <Table.Tr key={key}>
                    <Table.Td>
                      <Code>{`{${key}}`}</Code>
                    </Table.Td>
                    <Table.Td>
                      {description}
                      {MATTER_NOTICE_REQUIRED_KEYS.includes(key) && "（必須）"}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {validationError ? (
              <Alert color="red" mb="sm">
                {validationError}
              </Alert>
            ) : (
              <>
                <Text size="sm" fw={500}>
                  プレビュー（サンプル値）
                </Text>
                <Text
                  size="sm"
                  className="whitespace-pre-wrap"
                  data-testid="slack-template-preview"
                >
                  {preview}
                </Text>
              </>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="default" disabled={isBusy} onClick={closeModal}>
                キャンセル
              </Button>
              <Button
                type="button"
                disabled={isBusy || !!validationError}
                onClick={handleSave}
              >
                保存
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default SlackNotificationSettings;
