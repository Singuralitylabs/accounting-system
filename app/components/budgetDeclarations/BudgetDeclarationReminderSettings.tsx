"use client";

import {
  Alert,
  Button,
  Chip,
  Group,
  LoadingOverlay,
  Text,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { normalizeBudgetDeclarationReminderTargetDays } from "@/app/utils/budgetDeclarationReminder";
import { updateBudgetDeclarationReminderTargetDays } from "@/app/utils/supabase/budgetDeclarationReminderSettings";
import { confirmAction } from "@/app/utils/confirmAction";
import { notifyError, notifySuccess } from "@/app/utils/notify";

const ALL_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

type Props = {
  // DynamicBudgetDeclarations 側での getBudgetDeclarationReminderSettings 失敗時は
  // null（フォームは表示せずエラー案内のみ表示する）
  initialTargetDays: number[] | null;
};

const BudgetDeclarationReminderSettings = ({ initialTargetDays }: Props) => {
  const [selectedDays, setSelectedDays] = useState<string[]>(
    (initialTargetDays ?? []).map(String),
  );
  const [isLoading, setIsLoading] = useState(false);

  if (initialTargetDays === null) {
    return (
      <Alert color="red" title="リマインド設定の取得に失敗しました" mb="lg">
        時間をおいてページを再読み込みしてください。
      </Alert>
    );
  }

  const handleSave = async () => {
    const normalized = normalizeBudgetDeclarationReminderTargetDays(
      selectedDays.map(Number),
    );

    const confirmed = await confirmAction(
      normalized.length === 0
        ? "対象日を空にして保存すると、事前収支申告の未申告リマインドが停止します。よろしいですか？"
        : "リマインド対象日を更新しますか？",
    );
    if (!confirmed) return;

    try {
      setIsLoading(true);
      const { error } =
        await updateBudgetDeclarationReminderTargetDays(normalized);
      if (error) {
        notifyError(error.message);
        return;
      }
      setSelectedDays(normalized.map(String));
      notifySuccess("リマインド設定を更新しました。");
    } catch (error) {
      console.error("リマインド設定の保存に失敗しました。", error);
      notifyError("リマインド設定の保存に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative mb-6 p-4 border-collapse border border-gray-500 bg-slate-50 rounded">
      <LoadingOverlay visible={isLoading} />
      <div className="flex justify-between items-center mb-2">
        <Title order={3}>リマインド設定</Title>
        <Button type="button" disabled={isLoading} onClick={handleSave}>
          保存
        </Button>
      </div>
      <Text size="sm" c="dimmed" mb="xs">
        未申告チームへの Slack
        リマインド対象日（JST）を選択してください。29〜31日は存在しない月があり、その月はスキップされます。
      </Text>
      {selectedDays.length === 0 && (
        <Alert color="yellow" title="現在リマインドは無効です" mb="sm">
          対象日が選択されていないため、Slack リマインドは送信されません。
        </Alert>
      )}
      <Chip.Group multiple value={selectedDays} onChange={setSelectedDays}>
        <Group gap="xs">
          {ALL_DAYS.map((day) => (
            <Chip key={day} value={String(day)} size="sm">
              {day}
            </Chip>
          ))}
        </Group>
      </Chip.Group>
    </div>
  );
};

export default BudgetDeclarationReminderSettings;
