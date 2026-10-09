"use client";

import {
  Alert,
  Badge,
  Button,
  Group,
  LoadingOverlay,
  Modal,
  NativeSelect,
  Paper,
  Text,
  Textarea,
} from "@mantine/core";
import { useState } from "react";
import { SlackMessagePreview } from "@/app/components/slack/SlackMessagePreview";
import { SlackPlaceholderTable } from "@/app/components/slack/SlackPlaceholderTable";
import {
  BUDGET_DECLARATION_REMINDER_PLACEHOLDERS,
  BudgetDeclarationReminderDay,
  DEFAULT_BUDGET_DECLARATION_REMINDER_MESSAGE,
  buildBudgetDeclarationReminderSampleAutoText,
  normalizeBudgetDeclarationReminderDays,
  validateBudgetDeclarationReminderMessage,
} from "@/app/utils/budgetDeclarationReminder";
import { expandSlackTemplate, sampleValues } from "@/app/utils/slackTemplate";
import { updateBudgetDeclarationReminderDays } from "@/app/utils/supabase/budgetDeclarationReminderSettings";
import { confirmAction } from "@/app/utils/confirmAction";
import { notifyError, notifySuccess } from "@/app/utils/notify";

const ALL_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

type Props = {
  // null when the fetch failed (the modal shows only an error message).
  initialDays: BudgetDeclarationReminderDay[] | null;
};

const REMINDER_AUTO_TEXT = buildBudgetDeclarationReminderSampleAutoText();

// Reminder settings button and modal; always mounted in the list's button row, so the saved value persists across open/close.
const BudgetDeclarationReminderSettings = ({ initialDays }: Props) => {
  const [opened, setOpened] = useState(false);
  // Draft rows (one card per target day), kept in ascending day order. A removed day is gone with its
  // text; adding it again starts from the default message.
  const [draftRows, setDraftRows] = useState<BudgetDeclarationReminderDay[]>(
    normalizeBudgetDeclarationReminderDays(initialDays ?? []),
  );
  // Currently saved rows; updated only on successful save. Kept separate from the unsaved draft so removing a card does not show "reminders disabled".
  const [savedDays, setSavedDays] = useState<BudgetDeclarationReminderDay[]>(
    initialDays ?? [],
  );
  const [isAdding, setIsAdding] = useState(false);
  const [dayToAdd, setDayToAdd] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // True while the confirm dialog is shown. Mantine 7.13 lets every open Modal handle Esc, so closing the dialog with Esc would also close this modal and discard the draft.
  const [isConfirming, setIsConfirming] = useState(false);

  const isFetchFailed = initialDays === null;
  const isBusy = isLoading || isConfirming;

  const openModal = () => {
    // Discard the unsaved draft on close; re-init from saved days on open.
    setDraftRows(normalizeBudgetDeclarationReminderDays(savedDays));
    setIsAdding(false);
    setDayToAdd("");
    setOpened(true);
  };

  const closeModal = () => {
    // Do not close while saving or confirming (guards even though close controls are disabled while isBusy).
    if (isBusy) return;
    setOpened(false);
  };

  const usedDays = new Set(draftRows.map(({ day }) => day));
  const availableDays = ALL_DAYS.filter((day) => !usedDays.has(day));

  const handleAddDay = () => {
    const day = Number(dayToAdd);
    if (!day || usedDays.has(day)) return;
    setDraftRows((prev) =>
      normalizeBudgetDeclarationReminderDays([
        ...prev,
        { day, message: DEFAULT_BUDGET_DECLARATION_REMINDER_MESSAGE },
      ]),
    );
    setIsAdding(false);
    setDayToAdd("");
  };

  const handleChangeMessage = (day: number, message: string) =>
    setDraftRows((prev) =>
      prev.map((row) => (row.day === day ? { ...row, message } : row)),
    );

  const handleRemoveDay = (day: number) =>
    setDraftRows((prev) => prev.filter((row) => row.day !== day));

  const errorsByDay = new Map(
    draftRows.flatMap(({ day, message }) => {
      const error = validateBudgetDeclarationReminderMessage(message);
      return error ? [[day, error] as const] : [];
    }),
  );
  const previewValues = sampleValues(BUDGET_DECLARATION_REMINDER_PLACEHOLDERS);

  const handleSave = async () => {
    if (errorsByDay.size > 0) return;
    const normalized = normalizeBudgetDeclarationReminderDays(draftRows);

    let confirmed: boolean;
    try {
      setIsConfirming(true);
      confirmed = await confirmAction(
        normalized.length === 0
          ? "対象日を空にして保存すると、事前収支申告の未申告リマインドが停止します。よろしいですか？"
          : "リマインド対象日を更新しますか？",
      );
    } finally {
      setIsConfirming(false);
    }
    if (!confirmed) return;

    try {
      setIsLoading(true);
      const { error } = await updateBudgetDeclarationReminderDays(normalized);
      if (error) {
        // Keep the modal open on failure so the draft can be fixed and saved again.
        notifyError(error.message);
        return;
      }
      setDraftRows(normalized);
      setSavedDays(normalized);
      notifySuccess("リマインド設定を更新しました。");
      setOpened(false);
    } catch (error) {
      console.error("リマインド設定の保存に失敗しました。", error);
      notifyError("リマインド設定の保存に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Group gap="xs">
        {/* Shown next to the button so a disabled reminder is noticeable (hidden when fetch failed: state unknown). */}
        {!isFetchFailed && savedDays.length === 0 && (
          <Badge color="yellow">リマインド無効</Badge>
        )}
        <Button type="button" size="xs" variant="light" onClick={openModal}>
          リマインド設定
        </Button>
      </Group>
      <Modal
        opened={opened}
        onClose={closeModal}
        title="リマインド設定"
        size="xl"
        withCloseButton={!isBusy}
        closeOnEscape={!isBusy}
        closeOnClickOutside={!isBusy}
        closeButtonProps={{ "aria-label": "閉じる" }}
      >
        {isFetchFailed ? (
          <Alert color="red" title="リマインド設定の取得に失敗しました">
            時間をおいてページを再読み込みしてください。
          </Alert>
        ) : (
          <div className="relative">
            <LoadingOverlay visible={isLoading} />
            <Text size="sm" c="dimmed" mb="xs">
              未申告チームへの Slack
              リマインドを送る日（JST）を追加し、日ごとに文面を設定してください。
            </Text>
            <SlackPlaceholderTable
              placeholders={BUDGET_DECLARATION_REMINDER_PLACEHOLDERS}
            />
            <Text size="xs" c="dimmed" mt={4} mb="sm">
              未申告チーム・期限・URL は文面の後ろに自動で付きます。
            </Text>
            {savedDays.length === 0 ? (
              <Alert color="yellow" title="現在リマインドは無効です" mb="sm">
                対象日が追加されていないため、Slack リマインドは送信されません。
              </Alert>
            ) : (
              draftRows.length === 0 && (
                <Alert
                  color="yellow"
                  title="保存するとリマインドが無効になります"
                  mb="sm"
                >
                  対象日がすべて削除されています。このまま保存すると Slack
                  リマインドが停止します。
                </Alert>
              )
            )}
            {draftRows.map(({ day, message }) => (
              <Paper
                key={day}
                withBorder
                p="md"
                mb="sm"
                data-testid={`reminder-card-${day}`}
              >
                <Group justify="space-between" mb="xs">
                  <Text fw={600}>{day}日</Text>
                  <Button
                    type="button"
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    disabled={isBusy}
                    aria-label={`${day}日を削除`}
                    onClick={() => handleRemoveDay(day)}
                  >
                    削除
                  </Button>
                </Group>
                <Textarea
                  label={`${day}日の文面`}
                  value={message}
                  onChange={(event) =>
                    handleChangeMessage(day, event.currentTarget.value)
                  }
                  error={errorsByDay.get(day)}
                  autosize
                  minRows={4}
                  mb="xs"
                />
                {!errorsByDay.has(day) && (
                  <SlackMessagePreview
                    text={expandSlackTemplate(message, previewValues)}
                    autoText={REMINDER_AUTO_TEXT}
                    data-testid={`reminder-preview-${day}`}
                  />
                )}
              </Paper>
            ))}
            {isAdding ? (
              <Group align="flex-end" gap="xs">
                <NativeSelect
                  label="追加する日"
                  description="29〜31日は存在しない月があり、その月はスキップされます。"
                  value={dayToAdd}
                  onChange={(event) => setDayToAdd(event.currentTarget.value)}
                  data={[
                    { value: "", label: "日を選択" },
                    ...availableDays.map((day) => ({
                      value: String(day),
                      label: `${day}日`,
                    })),
                  ]}
                />
                <Button
                  type="button"
                  size="xs"
                  disabled={isBusy || !dayToAdd}
                  onClick={handleAddDay}
                >
                  追加
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="default"
                  onClick={() => {
                    setIsAdding(false);
                    setDayToAdd("");
                  }}
                >
                  やめる
                </Button>
              </Group>
            ) : (
              <Button
                type="button"
                size="xs"
                variant="light"
                disabled={isBusy || availableDays.length === 0}
                onClick={() => setIsAdding(true)}
              >
                日付を追加
              </Button>
            )}
            <Group justify="flex-end" mt="lg">
              <Button variant="default" disabled={isBusy} onClick={closeModal}>
                キャンセル
              </Button>
              {/* Disabled while confirming too: double click would stack dialogs and save twice. */}
              <Button
                type="button"
                disabled={isBusy || errorsByDay.size > 0}
                onClick={handleSave}
              >
                保存
              </Button>
            </Group>
          </div>
        )}
      </Modal>
    </>
  );
};

export default BudgetDeclarationReminderSettings;
