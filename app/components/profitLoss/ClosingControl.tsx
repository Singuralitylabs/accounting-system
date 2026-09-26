"use client";

import { ClosingInfo } from "@/app/types/types";
import { confirmAction } from "@/app/utils/confirmAction";
import { formatDateTimeToJp, formatMonthLabel } from "@/app/utils/formatter";
import { notifyError, notifySuccess, toErrorMessage } from "@/app/utils/notify";
import {
  useCloseProfitLossMonth,
  useReopenProfitLossMonth,
} from "@/app/hooks/useProfitLossClosing";
import { Badge, Group, Paper, Switch, Text } from "@mantine/core";
import { FaLock } from "react-icons/fa";

type Props = {
  month: string; // "YYYY-MM"
  closing: ClosingInfo | null;
  canClose: boolean; // 確定・確定解除を操作できるか（accounting / admin）
};

// 月次タブの「確定済み」チェックと確定情報の表示（Issue #148）。
// オン = その時点のライブ集計をスナップショットとして保存（再確定も同じ）、
// オフ = 確定の解除（スナップショットと見送り記録を削除し、ライブ集計の表示に戻る）。
// チームリーダーには確定情報のみ表示し、操作はさせない
const ClosingControl = ({ month, closing, canClose }: Props) => {
  const closeMutation = useCloseProfitLossMonth();
  const reopenMutation = useReopenProfitLossMonth();
  const isPending = closeMutation.isPending || reopenMutation.isPending;
  const monthLabel = formatMonthLabel(month);

  const handleChange = async (checked: boolean) => {
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
    <Paper withBorder radius="md" p="sm" className="mb-4">
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
