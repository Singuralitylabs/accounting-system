"use client";

import { Button, Group } from "@mantine/core";
import Link from "next/link";

type Props = {
  canEdit: boolean; // accounting / admin のみ true
};

// 損益計算書ページから経理マスタ系（定期費用マスタ・経理追加収支）への導線。
// 両ルートとも許可ロールが同一（accounting / admin）のため同じフラグで出し分ける。
const AccountingMasterActions = ({ canEdit }: Props) => {
  if (!canEdit) {
    return null;
  }

  return (
    <Group justify="flex-end" gap="xs" className="mb-2">
      <Button
        component={Link}
        href="/recurring-costs"
        size="xs"
        variant="light"
      >
        定期費用マスタを管理
      </Button>
      <Button component={Link} href="/extra-entries" size="xs" variant="light">
        経理追加収支を管理
      </Button>
    </Group>
  );
};

export default AccountingMasterActions;
