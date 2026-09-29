"use client";

import { useState } from "react";
import {
  Button,
  Modal,
  NumberInput,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { AdjustmentTarget } from "@/app/types/types";
import { useSaveProfitLossAdjustment } from "@/app/hooks/useProfitLossAdjustments";
import { formatCurrency } from "@/app/utils/formatter";
import {
  SAVE_ADJUSTMENT_TOAST,
  resolveSaveAdjustmentOutcome,
} from "@/app/utils/profitLossAdjustmentToast";
import { confirmAction } from "@/app/utils/confirmAction";
import { notifyError, notifySuccess, toErrorMessage } from "@/app/utils/notify";

type Props = {
  opened: boolean;
  onClose: () => void;
  target: AdjustmentTarget;
  targetMonth: string; // "YYYY-MM"
  label: string;
  sourceAmount: number;
  currentActualAmount: number;
  currentReason: string;
};

// Adjustment modal for statement lines. Only the actual amount is entered; adjustment_amount = actual - source is computed on save. Restoring the source amount deletes the existing adjustment (zero adjustments are not kept).
const ProfitLossAdjustmentModal = ({
  opened,
  onClose,
  target,
  targetMonth,
  label,
  sourceAmount,
  currentActualAmount,
  currentReason,
}: Props) => {
  const [actualAmount, setActualAmount] = useState<number | "">(
    currentActualAmount,
  );
  const [reason, setReason] = useState(currentReason);
  const saveMutation = useSaveProfitLossAdjustment();

  const handleClose = () => {
    if (saveMutation.isPending) return;
    onClose();
  };

  const hadExistingAdjustment = currentActualAmount !== sourceAmount;
  // Nothing to save when there was no adjustment and the amount is unchanged (disable the button).
  const hasNothingToSave =
    actualAmount === sourceAmount && !hadExistingAdjustment;

  const handleSave = async () => {
    if (actualAmount === "") {
      notifyError("実績額を入力してください。");
      return;
    }
    if (hasNothingToSave) return;

    const willRevert = actualAmount === sourceAmount;
    if (!willRevert && reason.trim() === "") {
      notifyError("調整理由を入力してください。");
      return;
    }

    const confirmed = await confirmAction(
      willRevert
        ? `${label}の実績額修正を削除し、元データの金額（${formatCurrency(sourceAmount)}）に戻しますか？`
        : `${label}の実績額を ${formatCurrency(actualAmount)} として保存しますか？`,
    );
    if (!confirmed) return;

    try {
      // Delete/save/no-change is decided by the server (which refetches the source). willRevert is only an estimate from a possibly stale sourceAmount. Zero diff with nothing to delete (e.g. already deleted in another tab) returns deleted=false, adjustmentAmount=0: report "already deleted".
      const { deleted, adjustmentAmount } = await saveMutation.mutateAsync({
        target,
        targetMonth,
        actualAmount,
        reason: reason.trim(),
      });
      notifySuccess(
        SAVE_ADJUSTMENT_TOAST[
          resolveSaveAdjustmentOutcome(deleted, adjustmentAmount)
        ],
      );
      onClose();
    } catch (error) {
      notifyError(toErrorMessage(error, "実績額の保存に失敗しました。"));
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={`実績額を修正 - ${label}`}
    >
      <Stack>
        <Text size="sm" c="dimmed">
          元データの金額: {formatCurrency(sourceAmount)}
        </Text>
        <NumberInput
          label="実績額"
          value={actualAmount}
          thousandSeparator=","
          prefix="¥"
          // numeric(15,2): limit to 2 decimals.
          decimalScale={2}
          fixedDecimalScale
          // No min: negative amounts (reductions) are allowed.
          onChange={(value) =>
            setActualAmount(typeof value === "number" ? value : "")
          }
        />
        <Textarea
          label="調整理由"
          placeholder="実績額と元データが異なる理由をご記入ください。"
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          minRows={2}
          required={actualAmount !== sourceAmount}
        />
        <Button
          onClick={handleSave}
          loading={saveMutation.isPending}
          disabled={hasNothingToSave}
          fullWidth
        >
          保存
        </Button>
      </Stack>
    </Modal>
  );
};

export default ProfitLossAdjustmentModal;
