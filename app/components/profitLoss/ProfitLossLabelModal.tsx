"use client";

import { useState } from "react";
import { Button, Modal, Stack, Text, TextInput } from "@mantine/core";
import { LabelTarget } from "@/app/types/types";
import { useSaveProfitLossLabel } from "@/app/hooks/useProfitLossLabels";
import {
  LABEL_MAX_LENGTH,
  normalizeLabelInput,
} from "@/app/utils/profitLossLogic";
import { notifyError, notifySuccess, toErrorMessage } from "@/app/utils/notify";

type Props = {
  opened: boolean;
  onClose: () => void;
  target: LabelTarget;
  originalTitle: string;
  currentTitle: string | null;
};

// Title override modal; saved per row. Saving blank deletes the override; source names are unchanged.
const ProfitLossLabelModal = ({
  opened,
  onClose,
  target,
  originalTitle,
  currentTitle,
}: Props) => {
  const [title, setTitle] = useState(currentTitle ?? "");
  const saveMutation = useSaveProfitLossLabel();

  const normalized = normalizeLabelInput(title);
  const hasNothingToSave = normalized === currentTitle;
  const isTooLong = normalized !== null && normalized.length > LABEL_MAX_LENGTH;

  const handleClose = () => {
    if (saveMutation.isPending) return;
    onClose();
  };

  const handleSave = async () => {
    if (hasNothingToSave || isTooLong) return;
    try {
      const { deleted } = await saveMutation.mutateAsync({
        target,
        label: title,
      });
      notifySuccess(
        deleted
          ? "タイトルを元の名称に戻しました。"
          : "タイトルを保存しました。",
      );
      onClose();
    } catch (error) {
      notifyError(toErrorMessage(error, "タイトルの保存に失敗しました。"));
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="タイトルを変更">
      <Stack>
        <Text size="sm" c="dimmed">
          元の名称: {originalTitle}
        </Text>
        <TextInput
          label="損益計算書上のタイトル"
          description="空欄で保存すると元の名称に戻ります。全月の損益計算書に反映され、案件画面などの名称は変わりません。"
          placeholder={originalTitle}
          value={title}
          maxLength={LABEL_MAX_LENGTH + 50}
          error={
            isTooLong
              ? `${LABEL_MAX_LENGTH}文字以内で入力してください。`
              : undefined
          }
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <Button
          onClick={handleSave}
          loading={saveMutation.isPending}
          disabled={hasNothingToSave || isTooLong}
          fullWidth
        >
          保存
        </Button>
      </Stack>
    </Modal>
  );
};

export default ProfitLossLabelModal;
