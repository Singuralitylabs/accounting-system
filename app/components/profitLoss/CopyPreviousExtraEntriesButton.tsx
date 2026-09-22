"use client";

import { Button, Tooltip } from "@mantine/core";
import {
  useCopyExtraEntriesFromPreviousMonth,
  usePreviousMonthExtraEntries,
} from "@/app/hooks/useExtraEntryData";
import { confirmAction } from "@/app/utils/confirmAction";
import { addMonths, formatMonthLabel } from "@/app/utils/formatter";
import { notifyError, notifySuccess } from "@/app/utils/notify";

type Props = {
  month: string; // 表示中の対象月（"YYYY-MM"）
  hasExistingEntries: boolean; // 当月に既に経理追加収支があるか（追記になる旨の案内用）
};

// 損益計算書 月次タブの「前月の経理追加収支をコピー」ボタン。
// 経理担当者・管理者のみ表示する（呼び出し側で canEditExtraEntries を見て出し分ける。
// 書き込み自体も RLS で accounting / admin のみに制限される）。
const CopyPreviousExtraEntriesButton = ({
  month,
  hasExistingEntries,
}: Props) => {
  const previousMonth = addMonths(month, -1);
  const {
    data: previousEntries,
    isLoading,
    isError,
  } = usePreviousMonthExtraEntries(month);
  const copyMutation = useCopyExtraEntriesFromPreviousMonth();

  const previousCount = previousEntries?.length ?? 0;
  const disabledReason = isLoading
    ? "前月の経理追加収支を確認しています…"
    : isError
      ? "前月の経理追加収支の確認に失敗しました。"
      : previousCount === 0
        ? "前月の経理追加収支がありません。"
        : null;

  const handleCopy = async () => {
    if (!previousEntries?.length) return;

    const appendNote = hasExistingEntries
      ? "\n※ 当月には既に経理追加収支が登録されています。コピーした明細は追記されます。"
      : "";
    const confirmed = await confirmAction(
      `${formatMonthLabel(previousMonth)}の経理追加収支 ${previousCount} 件を${formatMonthLabel(
        month,
      )}へコピーしますか？${appendNote}`,
    );
    if (!confirmed) return;

    try {
      const { insertedCount, skippedCount } = await copyMutation.mutateAsync({
        sourceIds: previousEntries.map((entry) => entry.id),
        targetMonth: month,
      });
      if (insertedCount === 0 && skippedCount > 0) {
        // 全件が当月の既存明細と重複していた（誤操作による連続実行など）
        notifySuccess(
          "当月に同一内容の経理追加収支が既に登録されているため、コピーをスキップしました。",
        );
      } else if (skippedCount > 0) {
        notifySuccess(
          `${insertedCount}件の経理追加収支をコピーしました（${skippedCount}件は当月に同一内容が既にあるためスキップしました）。`,
        );
      } else {
        notifySuccess(`${insertedCount}件の経理追加収支をコピーしました。`);
      }
    } catch (error) {
      console.error("経理追加収支の前月コピーに失敗しました:", error);
      notifyError("経理追加収支の前月コピーに失敗しました。");
    }
  };

  return (
    <Tooltip label={disabledReason} disabled={!disabledReason}>
      <span>
        <Button
          type="button"
          size="xs"
          variant="light"
          disabled={!!disabledReason}
          loading={copyMutation.isPending}
          onClick={handleCopy}
        >
          前月の経理追加収支をコピー
        </Button>
      </span>
    </Tooltip>
  );
};

export default CopyPreviousExtraEntriesButton;
