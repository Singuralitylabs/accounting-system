"use client";

import { Button, Group } from "@mantine/core";
import Link from "next/link";

type Props = {
  canEditRecurringCosts: boolean; // ROUTE_PERMISSIONS["/recurring-costs"] 判定
  canEditExtraEntries: boolean; // ROUTE_PERMISSIONS["/extra-entries"] 判定
};

// 損益計算書ページから経理マスタ系（定期費用マスタ・経理追加収支）への導線。
// ボタンごとに対応するルートの ROUTE_PERMISSIONS で個別に出し分ける
// （現状は両ルートとも accounting / admin だが、将来どちらかだけロールが
// 変わっても UI が middleware の保護と食い違わないようにするため）。
const AccountingMasterActions = ({
  canEditRecurringCosts,
  canEditExtraEntries,
}: Props) => {
  if (!canEditRecurringCosts && !canEditExtraEntries) {
    return null;
  }

  return (
    <Group justify="flex-end" gap="xs" className="mb-2">
      {canEditRecurringCosts && (
        <Button
          component={Link}
          href="/recurring-costs"
          size="xs"
          variant="light"
        >
          定期費用マスタを管理
        </Button>
      )}
      {canEditExtraEntries && (
        <Button
          component={Link}
          href="/extra-entries"
          size="xs"
          variant="light"
        >
          経理追加収支を管理
        </Button>
      )}
    </Group>
  );
};

export default AccountingMasterActions;
