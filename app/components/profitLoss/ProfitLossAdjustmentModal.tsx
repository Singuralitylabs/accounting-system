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
import { confirmAction } from "@/app/utils/confirmAction";
import { notifyError, notifySuccess, toErrorMessage } from "@/app/utils/notify";

type Props = {
  opened: boolean;
  onClose: () => void;
  target: AdjustmentTarget;
  targetMonth: string; // "YYYY-MM"
  label: string; // 対象の表示名（確認ダイアログ・見出しに使う）
  sourceAmount: number; // 元データの現在の金額
  currentActualAmount: number; // 初期値（未調整なら sourceAmount と同じ）
  currentReason: string; // 既存の調整理由（未調整なら空文字）
};

// 損益計算書の明細行に対する「実績額を修正」モーダル。
// 入力は実績額のみで、保存時に adjustment_amount = 実績額 − 元データ金額 を
// システムが計算する（Issue #108）。実績額を元データと同額に戻すと、既存の
// 調整レコードは削除される（0 の調整は保持しない）。
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

  const handleSave = async () => {
    if (actualAmount === "") {
      notifyError("実績額を入力してください。");
      return;
    }

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
      await saveMutation.mutateAsync({
        target,
        targetMonth,
        actualAmount,
        reason: reason.trim(),
      });
      notifySuccess(
        willRevert ? "実績額修正を削除しました。" : "実績額を保存しました。",
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
          // マイナス金額（減額調整）を許容するため min は設定しない
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
        <Button onClick={handleSave} loading={saveMutation.isPending} fullWidth>
          保存
        </Button>
      </Stack>
    </Modal>
  );
};

export default ProfitLossAdjustmentModal;
