"use client";

import { BudgetClosingInfo } from "@/app/types/types";
import {
  useCloseBudgetDeclarationMonth,
  useReopenBudgetDeclarationMonth,
} from "@/app/hooks/useBudgetDeclarationData";
import { confirmAction } from "@/app/utils/confirmAction";
import { formatDateTimeToJp, formatMonthLabel } from "@/app/utils/formatter";
import { notifyError, notifySuccess, toErrorMessage } from "@/app/utils/notify";
import { Badge, Group, Switch, Text } from "@mantine/core";
import { FaLock } from "react-icons/fa";

type Props = {
  month: string; // "YYYY-MM"
  closing: BudgetClosingInfo | null;
  canClose: boolean;
  // Disabled while the month list is still showing the previous month's data.
  disabled?: boolean;
};

// On = close the month for all teams (no one can create/edit/delete declarations); off = reopen.
// Teamleaders see the state only.
const BudgetClosingControl = ({
  month,
  closing,
  canClose,
  disabled = false,
}: Props) => {
  const closeMutation = useCloseBudgetDeclarationMonth();
  const reopenMutation = useReopenBudgetDeclarationMonth();
  const isPending = closeMutation.isPending || reopenMutation.isPending;
  const monthLabel = formatMonthLabel(month);

  const handleChange = async (checked: boolean) => {
    if (checked) {
      const confirmed = await confirmAction(
        `${monthLabel}の事前収支申告を確定しますか？\n全チームの申告が確定され、確定中は申告の作成・編集・削除ができなくなります。`,
      );
      if (!confirmed) return;
      try {
        await closeMutation.mutateAsync(month);
        notifySuccess(`${monthLabel}の事前収支申告を確定しました。`);
      } catch (error) {
        notifyError(
          toErrorMessage(error, "事前収支申告の確定に失敗しました。"),
        );
      }
      return;
    }
    const confirmed = await confirmAction(
      `${monthLabel}の確定を解除しますか？\n申告の作成・編集・削除が再びできるようになります。`,
    );
    if (!confirmed) return;
    try {
      await reopenMutation.mutateAsync(month);
      notifySuccess(`${monthLabel}の確定を解除しました。`);
    } catch (error) {
      notifyError(
        toErrorMessage(error, "事前収支申告の確定解除に失敗しました。"),
      );
    }
  };

  return (
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
          </>
        ) : (
          <Text size="sm" c="dimmed">
            この月は未確定です。
          </Text>
        )}
      </Group>
      {canClose && (
        <Switch
          label="確定済み"
          checked={!!closing}
          disabled={isPending || disabled}
          onChange={(event) => handleChange(event.currentTarget.checked)}
        />
      )}
    </Group>
  );
};

export default BudgetClosingControl;
