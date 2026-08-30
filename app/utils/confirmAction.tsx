"use client";

import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";

type ConfirmActionOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
};

export const confirmAction = (
  message: string,
  options: ConfirmActionOptions = {},
): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    modals.openConfirmModal({
      title: options.title ?? "確認",
      children: (
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
          {message}
        </Text>
      ),
      labels: {
        confirm: options.confirmLabel ?? "OK",
        cancel: options.cancelLabel ?? "キャンセル",
      },
      confirmProps: options.confirmColor
        ? { color: options.confirmColor }
        : undefined,
      onConfirm: () => settle(true),
      onCancel: () => settle(false),
      // Mantine 7.13 は Esc / X / オーバーレイクリックで closeModal のみ呼び、
      // onCancel が発火しない。閉じたら必ず Promise を解決して呼び出し側の
      // finally（LoadingOverlay 解除など）が走るようにする。
      onClose: () => settle(false),
    });
  });

export const confirmCreateMatter = async (
  title: string,
  isFixed: boolean,
  businessAmounts: Array<number | null | undefined>,
) => {
  const mainOk = await confirmAction(
    isFixed
      ? `案件[${title}]を経理申請しますか？`
      : `案件[${title}]の下書きを作成しますか？\n作成した案件は経理申請扱いにはなりませんが、経理に共有はされます。`,
  );
  if (!mainOk) return false;

  const totalCompensation = businessAmounts.reduce<number>(
    (sum, amount) => sum + (amount || 0),
    0,
  );
  if (totalCompensation === 0) {
    return confirmAction(
      "取引先情報の報酬額の合計が0円です。このまま作成して良いでしょうか？",
    );
  }
  return true;
};

export {
  DELETE_MATTER_CONFIRM_MESSAGE,
  getUpdateMatterConfirmMessage,
} from "@/app/utils/matterConfirmMessages";
