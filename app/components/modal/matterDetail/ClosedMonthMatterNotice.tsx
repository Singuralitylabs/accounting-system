"use client";

import { Alert } from "@mantine/core";
import { useClosedMonths } from "@/app/hooks/useClosedMonths";
import {
  closedMonthsForMatter,
  formatClosedMonths,
} from "@/app/utils/profitLossClosing";

type Props = {
  savedStartDate: string | null;
  currentStartDate?: string | null;
  // Draft (before accounting request / new): drafts are not counted in the statement, so the wording differs.
  isDraft: boolean;
};

// Notice when the matter counts in a closed month of the statement: either the saved or the entered start date is in a closed month (including moving the date into or out of one). Does not block saving.
const ClosedMonthMatterNotice = ({
  savedStartDate,
  currentStartDate,
  isDraft,
}: Props) => {
  const { closedMonths } = useClosedMonths();
  const months = closedMonthsForMatter(closedMonths, [
    savedStartDate,
    currentStartDate,
  ]);
  if (months.length === 0) {
    return null;
  }
  return (
    <Alert color="yellow" className="my-2" title="確定済みの月の案件です">
      {isDraft
        ? `この案件の開始日は損益計算書で確定済みの月（${formatClosedMonths(months)}）です。経理申請すると、経理の確認後にその月の損益計算書へ反映されます。`
        : `この案件は確定済みの月（${formatClosedMonths(months)}）の損益計算書に計上されています。変更は経理の確認後に損益計算書へ反映されます。`}
    </Alert>
  );
};

export default ClosedMonthMatterNotice;
