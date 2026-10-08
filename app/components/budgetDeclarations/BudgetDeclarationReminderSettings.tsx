"use client";

import {
  Alert,
  Badge,
  Button,
  Chip,
  Code,
  Group,
  LoadingOverlay,
  Modal,
  Text,
  Textarea,
} from "@mantine/core";
import { useState } from "react";
import {
  BUDGET_DECLARATION_REMINDER_PLACEHOLDERS,
  BudgetDeclarationReminderDay,
  DEFAULT_BUDGET_DECLARATION_REMINDER_MESSAGE,
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

const toMessageMap = (rows: readonly BudgetDeclarationReminderDay[]) =>
  Object.fromEntries(rows.map(({ day, message }) => [String(day), message]));

// Reminder settings button and modal; always mounted in the list's button row, so the saved value persists across open/close.
const BudgetDeclarationReminderSettings = ({ initialDays }: Props) => {
  const [opened, setOpened] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>(
    (initialDays ?? []).map(({ day }) => String(day)),
  );
  // Draft message per day. Kept after a chip is deselected so re-selecting restores the text; only selected days are saved.
  const [messages, setMessages] = useState<Record<string, string>>(
    toMessageMap(initialDays ?? []),
  );
  // Currently saved rows; updated only on successful save. Kept separate from the unsaved draft (selectedDays) so removing a chip does not show "reminders disabled".
  const [savedDays, setSavedDays] = useState<BudgetDeclarationReminderDay[]>(
    initialDays ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  // True while the confirm dialog is shown. Mantine 7.13 lets every open Modal handle Esc, so closing the dialog with Esc would also close this modal and discard the selection.
  const [isConfirming, setIsConfirming] = useState(false);

  const isFetchFailed = initialDays === null;
  const isBusy = isLoading || isConfirming;

  const openModal = () => {
    // Discard the unsaved selection on close; re-init from saved days on open.
    setSelectedDays(savedDays.map(({ day }) => String(day)));
    setMessages(toMessageMap(savedDays));
    setOpened(true);
  };

  const closeModal = () => {
    // Do not close while saving or confirming (guards even though close controls are disabled while isBusy).
    if (isBusy) return;
    setOpened(false);
  };

  // A newly selected day starts from the default message.
  const messageOf = (day: string) =>
    messages[day] ?? DEFAULT_BUDGET_DECLARATION_REMINDER_MESSAGE;

  const draftRows = normalizeBudgetDeclarationReminderDays(
    selectedDays.map((day) => ({ day: Number(day), message: messageOf(day) })),
  );
  const errorsByDay = new Map(
    draftRows.flatMap(({ day, message }) => {
      const error = validateBudgetDeclarationReminderMessage(message);
      return error ? [[day, error] as const] : [];
    }),
  );
  const previewValues = sampleValues(BUDGET_DECLARATION_REMINDER_PLACEHOLDERS);

  const handleSave = async () => {
    if (errorsByDay.size > 0) return;
    const normalized = draftRows;

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
        // Keep the modal open on failure so the selection can be redone.
        notifyError(error.message);
        return;
      }
      setSelectedDays(normalized.map(({ day }) => String(day)));
      setMessages(toMessageMap(normalized));
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
        size="lg"
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
              リマインド対象日（JST）を選択し、日ごとに文面を設定してください。29〜31日は存在しない月があり、その月はスキップされます。
            </Text>
            {savedDays.length === 0 ? (
              <Alert color="yellow" title="現在リマインドは無効です" mb="sm">
                対象日が選択されていないため、Slack リマインドは送信されません。
              </Alert>
            ) : (
              selectedDays.length === 0 && (
                <Alert
                  color="yellow"
                  title="保存するとリマインドが無効になります"
                  mb="sm"
                >
                  対象日の選択がすべて解除されています。このまま保存すると Slack
                  リマインドが停止します。
                </Alert>
              )
            )}
            <Chip.Group
              multiple
              value={selectedDays}
              onChange={setSelectedDays}
            >
              <Group gap="xs">
                {ALL_DAYS.map((day) => (
                  <Chip key={day} value={String(day)} size="sm">
                    {day}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
            {draftRows.map(({ day, message }) => (
              <div key={day} className="mt-4">
                <Textarea
                  label={`${day}日の文面`}
                  description={
                    <>
                      使用できるプレースホルダ:{" "}
                      {BUDGET_DECLARATION_REMINDER_PLACEHOLDERS.map(
                        ({ key, description }) => (
                          <span key={key} className="mr-2">
                            <Code>{`{${key}}`}</Code> {description}
                          </span>
                        ),
                      )}
                      。未申告チーム・期限・URL は文面の後ろに自動で付きます。
                    </>
                  }
                  value={message}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setMessages((prev) => ({ ...prev, [String(day)]: value }));
                  }}
                  error={errorsByDay.get(day)}
                  autosize
                  minRows={2}
                />
                {!errorsByDay.has(day) && (
                  <Text
                    size="xs"
                    c="dimmed"
                    className="whitespace-pre-wrap"
                    data-testid={`reminder-preview-${day}`}
                  >
                    プレビュー: {expandSlackTemplate(message, previewValues)}
                  </Text>
                )}
              </div>
            ))}
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
