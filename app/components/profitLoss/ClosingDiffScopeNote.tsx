"use client";

import { formatMonthLabel } from "@/app/utils/formatter";
import { Text } from "@mantine/core";

type Props = {
  // 確定後の変更の件数集計の対象の開始月（"YYYY-MM"。getClosingDiffSummary の fromMonth）
  fromMonth: string;
  className?: string;
};

// 確定後の変更の目印（バナー・月ピッカー・年間推移のアイコン）の対象範囲の注記（Issue #172）。
// 件数集計は直近の確定済みの月だけを対象にするため、それより前の確定済みの月を表示している
// ときに、目印が出ていなくても変更が無いとは限らないことを伝える
export const closingDiffScopeMessage = (fromMonth: string) =>
  `確定後の変更の目印は ${formatMonthLabel(fromMonth)}以降の確定済みの月が対象です（それより前の月は月次タブで開くと差分を確認できます）`;

// 確定済みの月 month が件数集計の対象の開始月 fromMonth より前か（目印が出ない月か）。
// fromMonth が無い（集計の取得前・失敗時・チームリーダー）場合は注記しないため false
export const isClosedMonthBeforeDiffScope = (
  month: string,
  closedMonths: ReadonlySet<string>,
  fromMonth: string | undefined,
): boolean =>
  fromMonth !== undefined && closedMonths.has(month) && month < fromMonth;

const ClosingDiffScopeNote = ({ fromMonth, className }: Props) => (
  <Text size="xs" c="dimmed" className={className}>
    {closingDiffScopeMessage(fromMonth)}
  </Text>
);

export default ClosingDiffScopeNote;
