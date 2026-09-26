"use client";

import { Alert } from "@mantine/core";
import { useClosedMonths } from "@/app/hooks/useClosedMonths";
import {
  closedMonthsForMatter,
  formatClosedMonths,
} from "@/app/utils/profitLossClosing";

type Props = {
  savedStartDate: string | null; // 保存済みの案件開始日（新規作成は null）
  currentStartDate?: string | null; // 入力中の案件開始日（編集できない画面では省略）
  // 下書き（経理申請前・新規作成）か。下書きは損益計算書に計上されないため文言を変える
  isDraft: boolean;
};

// 案件が損益計算書の確定済みの月（Issue #148）に計上される場合の注意表示（Issue #149）。
// 保存済み・入力中の案件開始日のどちらかの月が確定済みのとき表示する（開始日を
// 確定済みの月へ / から変更する場合も含む）。保存は妨げない
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
