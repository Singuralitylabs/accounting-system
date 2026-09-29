"use client";

import { formatMonthLabel } from "@/app/utils/formatter";
import { Text } from "@mantine/core";

type Props = {
  fromMonth: string; // "YYYY-MM"
  className?: string;
};

// Scope note for change markers: the count covers only recent closed months, so older closed months may have changes without a marker.
export const closingDiffScopeMessage = (fromMonth: string) =>
  `確定後の変更の目印は ${formatMonthLabel(fromMonth)}以降の確定済みの月が対象です（それより前の月は月次タブで開くと差分を確認できます）`;

// Whether month is before the count range (fromMonth onward). fromMonth is absent before fetch / on failure / for teamleaders: no note.
export const isBeforeDiffScope = (
  month: string,
  fromMonth: string | undefined,
): boolean => fromMonth !== undefined && month < fromMonth;

export const isClosedMonthBeforeDiffScope = (
  month: string,
  isClosed: boolean,
  fromMonth: string | undefined,
): boolean => isClosed && isBeforeDiffScope(month, fromMonth);

const ClosingDiffScopeNote = ({ fromMonth, className }: Props) => (
  <Text size="xs" c="dimmed" className={className}>
    {closingDiffScopeMessage(fromMonth)}
  </Text>
);

export default ClosingDiffScopeNote;
