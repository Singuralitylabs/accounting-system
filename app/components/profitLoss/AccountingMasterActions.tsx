"use client";

import { Button, Group } from "@mantine/core";
import Link from "next/link";

type Props = {
  canEditRecurringCosts: boolean;
  canEditExtraEntries: boolean;
  // Target month shown on the statement; carried to the extra-entries link as `?month=`.
  month?: string;
};

// Links from the statement to accounting masters. Each button is gated by its own route's ROUTE_PERMISSIONS so the UI stays consistent with middleware if the roles diverge later.
const AccountingMasterActions = ({
  canEditRecurringCosts,
  canEditExtraEntries,
  month,
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
          href={month ? `/extra-entries?month=${month}` : "/extra-entries"}
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
