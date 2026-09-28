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
  // 件数集計の対象の開始月（Issue #172）。それより前の確定済みの月があるときだけ渡し、
  // 対象範囲を注記する（その月の変更はバナーに出ないため）
  scopeFromMonth?: string;
};

// 損益計算書ページ上部の警告バナー（Issue #149。経理担当者・管理者のみ）。
// 表示中のタブ・月に関わらず、確定後に未処理の変更がある確定済みの月を一覧表示し、
// 月名のクリックで月次タブのその月へ切り替える
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
