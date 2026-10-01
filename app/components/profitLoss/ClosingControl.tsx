"use client";

import { ClosingInfo } from "@/app/types/types";
import { confirmAction } from "@/app/utils/confirmAction";
import { formatDateTimeToJp, formatMonthLabel } from "@/app/utils/formatter";
import { notifyError, notifySuccess, toErrorMessage } from "@/app/utils/notify";
import {
  useCloseProfitLossMonth,
  useReopenProfitLossMonth,
} from "@/app/hooks/useProfitLossClosing";
import {
  Badge,
  Group,
  LoadingOverlay,
  Paper,
  Switch,
  Text,
} from "@mantine/core";
import { useState } from "react";
import { FaLock } from "react-icons/fa";

type Props = {
  month: string; // "YYYY-MM"
  closing: ClosingInfo | null;
  canClose: boolean;
};

// On = save the live aggregation as a snapshot (rejected if already closed); off = reopen (delete snapshot and dismissals, back to live). Teamleaders see info only.
const ClosingControl = ({ month, closing, canClose }: Props) => {
  const closeMutation = useCloseProfitLossMonth();
  const reopenMutation = useReopenProfitLossMonth();
  // Also covers the confirm dialog, which the mutation's isPending does not: without it the
  // switch can be toggled again while the dialog is open and a second dialog stacks up.
  const [isConfirming, setIsConfirming] = useState(false);
  const mutationPending = closeMutation.isPending || reopenMutation.isPending;
  const isPending = isConfirming || mutationPending;
  const monthLabel = formatMonthLabel(month);

  const handleChange = async (checked: boolean) => {
    setIsConfirming(true);
    try {
      await runChange(checked);
    } finally {
      setIsConfirming(false);
    }
  };

  const runChange = async (checked: boolean) => {
    if (checked) {
      const confirmed = await confirmAction(
        `${monthLabel}の収支を確定しますか？\n現在の損益計算書（案件・管理費・経理追加収支・損益調整）を確定値として保存します。確定中はこの月の損益調整・経理追加収支を編集できません。案件の変更は確定値に自動では反映されず、変更として通知されます。`,
      );
      if (!confirmed) return;
      try {
        await closeMutation.mutateAsync(month);
        notifySuccess(`${monthLabel}の収支を確定しました。`);
      } catch (error) {
        notifyError(toErrorMessage(error, "月次収支の確定に失敗しました。"));
      }
      return;
    }
    const confirmed = await confirmAction(
      `${monthLabel}の確定を解除しますか？\n確定値と見送りの記録を削除し、ライブ集計の表示に戻ります。損益調整・経理追加収支を再び編集できるようになります。`,
    );
    if (!confirmed) return;
    try {
      await reopenMutation.mutateAsync(month);
      notifySuccess(`${monthLabel}の確定を解除しました。`);
    } catch (error) {
      notifyError(toErrorMessage(error, "月次収支の確定解除に失敗しました。"));
    }
  };

  if (!canClose && !closing) {
    return null;
  }

  return (
    <Paper withBorder radius="md" p="sm" className="relative mb-4">
      <LoadingOverlay visible={mutationPending} />
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap="xs">
          {closing ? (
            <>
              <Badge color="teal" leftSection={<FaLock size="0.6rem" />}>
                確定済み
              </Badge>
              <Text size="sm">
                {formatDateTimeToJp(closing.closedAt)} 確定者:{" "}
                {closing.closedByName}
              </Text>
              {closing.refreshedAt && (
                <Text size="sm" c="dimmed">
                  （最終反映: {formatDateTimeToJp(closing.refreshedAt)}{" "}
                  {closing.refreshedByName}）
                </Text>
              )}
            </>
          ) : (
            <Text size="sm" c="dimmed">
              この月は未確定です（ライブ集計を表示しています）。
            </Text>
          )}
        </Group>
        {canClose && (
          <Switch
            label="確定済み"
            checked={!!closing}
            disabled={isPending}
            onChange={(event) => handleChange(event.currentTarget.checked)}
          />
        )}
      </Group>
    </Paper>
  );
};

export default ClosingControl;
