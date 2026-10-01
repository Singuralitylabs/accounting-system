"use client";

import { AdjustableAmount, DisplayTitle } from "@/app/types/types";
import { formatCurrency } from "@/app/utils/formatter";
import { formatPaymentCycle } from "@/app/utils/paymentCycle";
import { teamLabel } from "@/app/utils/constants";
import { ActionIcon, Badge, Button, Group, Tooltip } from "@mantine/core";
import { CLOSED_MONTH_LOCK_MESSAGE } from "@/app/utils/profitLossClosing";
import { ReactNode, useState } from "react";
import {
  FaChevronDown,
  FaChevronRight,
  FaExclamationTriangle,
  FaPen,
} from "react-icons/fa";

// Inline style for hierarchy indent: Mantine's Table.Td padding outranks Tailwind pl-* classes.
export const INDENT = {
  child: { paddingLeft: "2rem" },
  detail: { paddingLeft: "3.75rem" },
} as const;

// Below md the tables drop secondary columns (CSS only; a viewport hook would flash the wrong layout on first render).
export const HIDE_ON_MOBILE = "hidden md:table-cell";

export const amountColor = (value: number) =>
  value < 0 ? "text-red-600" : "text-green-700";

export type AmountListRow = {
  label: string;
  value: number;
  colorize?: boolean;
  bold?: boolean;
  divider?: boolean;
};

// "label：amount" rows shared by the mobile profit cards (same shape as the budget declaration cards).
export const AmountList = ({ rows }: { rows: readonly AmountListRow[] }) => (
  <dl className="my-2 space-y-1">
    {rows.map((row) => (
      <div
        key={row.label}
        className={`flex items-baseline justify-between gap-3 text-sm ${
          row.divider ? "mt-1 border-t border-gray-200 pt-1" : ""
        }`}
      >
        <dt className="text-gray-600">{row.label}：</dt>
        <dd
          className={`m-0 ${row.bold ? "font-bold" : "font-semibold"} ${
            row.colorize ? amountColor(row.value) : ""
          }`}
        >
          {formatCurrency(row.value)}
        </dd>
      </div>
    ))}
  </dl>
);

// Row expansion state (set of keys); keys carry a kind prefix since names can collide across kinds. initialKeys are open initially.
export const useExpandedRows = (initialKeys: readonly string[] = []) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(
    () => new Set(initialKeys),
  );
  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  // Bulk open/close only the given keys (other kinds' expansion state is unchanged).
  const expandAll = (keys: readonly string[]) =>
    setExpandedRows((prev) => new Set([...Array.from(prev), ...keys]));
  const collapseAll = (keys: readonly string[]) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      keys.forEach((key) => next.delete(key));
      return next;
    });
  return { expandedRows, toggleRow, expandAll, collapseAll };
};

// label names the table for assistive tech (e.g. per-matter results).
export const ExpandAllButtons = ({
  label,
  onExpandAll,
  onCollapseAll,
  disabled = false,
}: {
  label: string;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  disabled?: boolean;
}) => (
  <Group gap={4} wrap="nowrap" justify="flex-end">
    <Button
      size="compact-xs"
      variant="subtle"
      disabled={disabled}
      onClick={onExpandAll}
      aria-label={`${label}をすべて開く`}
    >
      すべて開く
    </Button>
    <Button
      size="compact-xs"
      variant="subtle"
      color="gray"
      disabled={disabled}
      onClick={onCollapseAll}
      aria-label={`${label}をすべて閉じる`}
    >
      すべて閉じる
    </Button>
  </Group>
);

// Do not put role / tabIndex on the <tr> (it would break row semantics); the keyboard/assistive-tech entry point is the real button in the cell (ExpandToggle). Whole-row click is kept for convenience.
export const expandableRowProps = (onToggle: () => void) => ({
  className: "cursor-pointer",
  onClick: onToggle,
});

// Native button, so Enter / Space work by default; stop propagation to avoid double toggling with the row onClick.
// className replaces the default inline layout. The mobile card passes a full-width class so a long title wraps inside the card.
export const ExpandToggle = ({
  isExpanded,
  onToggle,
  className,
  children,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-expanded={isExpanded}
    className={`${
      className ?? "inline-flex items-center gap-2 text-left"
    } rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600`}
    onClick={(event) => {
      event.stopPropagation();
      onToggle();
    }}
  >
    <span className="shrink-0">
      {isExpanded ? (
        <FaChevronDown size="0.7rem" />
      ) : (
        <FaChevronRight size="0.7rem" />
      )}
    </span>
    {children}
  </button>
);

// Adjustment badge / source-changed warning next to a line's actual amount. The badge shows the reason in a tooltip (teamleaders may read reasons but get no edit controls); the trigger is a native button so it works with keyboard and assistive tech.
export const AdjustmentIndicators = ({
  detail,
}: {
  detail: AdjustableAmount;
}) => (
  <>
    {detail.adjustmentReason !== null && (
      <Tooltip label={`調整理由: ${detail.adjustmentReason}`}>
        <button
          type="button"
          className="ml-2 align-middle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          aria-label={`調整理由: ${detail.adjustmentReason}`}
          onClick={(event) => event.stopPropagation()}
        >
          <Badge size="xs" color="blue" variant="light">
            調整あり
          </Badge>
        </button>
      </Tooltip>
    )}
    {detail.sourceChanged && (
      <Tooltip label="調整の保存後に元データの金額が変更されています。実績額をご確認ください。">
        <button
          type="button"
          className="ml-1 inline-flex text-amber-600 align-middle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          aria-label="警告: 調整の保存後に元データの金額が変更されています。実績額をご確認ください。"
          onClick={(event) => event.stopPropagation()}
        >
          <FaExclamationTriangle size="0.75rem" />
        </button>
      </Tooltip>
    )}
  </>
);

export const adjustmentNote = (detail: AdjustableAmount): string | null =>
  detail.adjustmentAmount === 0
    ? null
    : `元データ ${formatCurrency(detail.sourceAmount)} / 調整 ${
        detail.adjustmentAmount > 0 ? "+" : ""
      }${formatCurrency(detail.adjustmentAmount)}`;

// includeItem=false under the per-item breakdown (the item is the heading). The payment cycle is shown only when not monthly (default). Team is always shown when includeTeam, including org-wide.
export const formatRecurringCostNote = (
  recurringCost: {
    item: string;
    paymentCycle: string;
    team: string | null;
  },
  { includeItem, includeTeam }: { includeItem: boolean; includeTeam: boolean },
) => {
  const parts = includeItem ? [recurringCost.item] : [];
  if (recurringCost.paymentCycle !== "monthly") {
    parts.push(formatPaymentCycle(recurringCost.paymentCycle));
  }
  if (includeTeam) {
    parts.push(teamLabel(recurringCost.team));
  }
  return parts.length > 0 ? `（${parts.join(" / ")}）` : "";
};

// Title decorations: "renamed" badge when overridden (original name in tooltip) and an edit icon when onEdit is given. Separate from the title text so a title inside an expand button does not nest interactive elements. Not used for team/category/item headings or extra-entry rows.
export const TitleExtras = ({
  title,
  originalTitle,
  onEdit,
}: {
  title: DisplayTitle;
  originalTitle: string;
  onEdit?: () => void;
}) => (
  <>
    {title.isCustomTitle && (
      <Tooltip label={`元の名称: ${originalTitle}`}>
        <button
          type="button"
          className="ml-1 align-middle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          aria-label={`元の名称: ${originalTitle}`}
          onClick={(event) => event.stopPropagation()}
        >
          <Badge size="xs" color="violet" variant="light">
            名称変更
          </Badge>
        </button>
      </Tooltip>
    )}
    {onEdit && (
      <ActionIcon
        size="xs"
        variant="subtle"
        color="gray"
        className="ml-1 align-middle"
        aria-label={`${title.displayTitle}のタイトルを変更`}
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
      >
        <FaPen size="0.6rem" />
      </ActionIcon>
    )}
  </>
);

export const EditableTitle = (props: {
  title: DisplayTitle;
  originalTitle: string;
  onEdit?: () => void;
}) => (
  <>
    <span>{props.title.displayTitle}</span>
    <TitleExtras {...props} />
  </>
);

// Disabled when the month is closed (tooltip says to reopen first); wrapped in a span because disabled buttons receive no hover events.
export const AdjustmentButton = ({
  isClosed,
  onClick,
}: {
  isClosed: boolean;
  onClick: () => void;
}) => (
  <Tooltip
    label={CLOSED_MONTH_LOCK_MESSAGE}
    disabled={!isClosed}
    multiline
    w={260}
  >
    <span>
      <Button
        size="xs"
        variant="subtle"
        disabled={isClosed}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
      >
        実績額を修正
      </Button>
    </span>
  </Tooltip>
);
