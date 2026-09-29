"use client";

import { ClosingDiffSummary } from "@/app/types/types";
import { formatMonthLabel } from "@/app/utils/formatter";
import { Alert, Anchor } from "@mantine/core";
import { Fragment } from "react";
import { FaExclamationTriangle } from "react-icons/fa";
import ClosingDiffScopeNote from "./ClosingDiffScopeNote";

type Props = {
  summary: ClosingDiffSummary;
  onSelectMonth: (month: string) => void;
  // Start month of the count; passed only when closed months exist before it (their changes are not shown in the banner).
  scopeFromMonth?: string;
};

// Warning banner for closed months with unprocessed changes, regardless of tab/month; clicking a month switches to it. Accounting/admin only.
const ClosingDiffBanner = ({
  summary,
  onSelectMonth,
  scopeFromMonth,
}: Props) => {
  if (summary.length === 0) {
    return null;
  }
  return (
    <Alert
      color="orange"
      icon={<FaExclamationTriangle />}
      title="確定後に未反映の変更がある月があります"
      className="mb-4"
    >
      {summary.map(({ month, count }, index) => (
        <Fragment key={month}>
          {index > 0 && " / "}
          <Anchor
            component="button"
            type="button"
            size="sm"
            onClick={() => onSelectMonth(month)}
          >
            {formatMonthLabel(month)}（{count}件）
          </Anchor>
        </Fragment>
      ))}
      {scopeFromMonth && (
        <ClosingDiffScopeNote fromMonth={scopeFromMonth} className="mt-1" />
      )}
    </Alert>
  );
};

export default ClosingDiffBanner;
