"use client";

import { Alert, Button, LoadingOverlay, Textarea } from "@mantine/core";
import { useEffect, useState } from "react";
import { SlackMessagePreview } from "@/app/components/slack/SlackMessagePreview";
import { SlackPlaceholderTable } from "@/app/components/slack/SlackPlaceholderTable";
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

type Props = {
  // True while saving or confirming, so the parent modal can refuse to close and drop the draft.
  onBusyChange: (busy: boolean) => void;
};

// "文面の設定" tab of the contact modal (admin / accounting only: the page itself is restricted).
// Loads on mount and stays mounted while the tabs switch, so an unsaved draft survives a tab change;
// closing the modal discards it.
const SlackNotificationSettings = ({ onBusyChange }: Props) => {
  const [draft, setDraft] = useState<MatterNoticeSettings>(EMPTY);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // True while the confirm dialog is shown: Esc would otherwise close the modal and discard the draft.
  const [isConfirming, setIsConfirming] = useState(false);

  const isBusy = isSaving || isConfirming;
  const validationError = validateMatterNoticeSettings(draft);

  useEffect(() => {
    onBusyChange(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { settings, error } = await getSlackNotificationSettings();
        if (cancelled) return;
        if (error || !settings) {
          setLoadFailed(true);
          return;
        }
        setDraft(settings);
      } catch (error) {
        console.error("Slack通知設定の取得に失敗しました。", error);
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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
      setIsSaving(true);
      const { error } = await updateSlackNotificationSettings(draft);
      if (error) {
        notifyError(error.message);
        return;
      }
      notifySuccess("Slack通知設定を更新しました。");
    } catch (error) {
      console.error("Slack通知設定の保存に失敗しました。", error);
      notifyError("Slack通知設定の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  if (loadFailed) {
    return (
      <Alert color="red" title="Slack通知設定の取得に失敗しました">
        時間をおいて再度開いてください。
      </Alert>
    );
  }

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
    <div className="relative">
      <LoadingOverlay visible={isLoading || isSaving} />
      <SlackPlaceholderTable
        placeholders={MATTER_NOTICE_PLACEHOLDERS}
        requiredKeys={MATTER_NOTICE_REQUIRED_KEYS}
      />
      <Textarea
        label="ヘッダ"
        value={draft.header}
        onChange={(event) =>
          setDraft({ ...draft, header: event.currentTarget.value })
        }
        autosize
        minRows={1}
        mt="sm"
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
        mb="sm"
      />
      {validationError ? (
        <Alert color="red" mb="sm">
          {validationError}
        </Alert>
      ) : (
        <SlackMessagePreview
          text={preview ?? ""}
          data-testid="slack-template-preview"
        />
      )}
      <div className="flex justify-end mt-4">
        <Button
          type="button"
          disabled={isLoading || isBusy || !!validationError}
          onClick={handleSave}
        >
          保存
        </Button>
      </div>
    </div>
  );
};

export default SlackNotificationSettings;
