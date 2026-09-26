"use client";

// 損益計算書の各表（案件別収支・分類別収支・管理費）で共通に使う表示部品

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

// 階層表示の字下げ（見出し → 子 → 明細）。Mantine の Table.Td の padding は
// Tailwind の pl-* クラスより詳細度が高く効かないため、インラインスタイルで指定する
export const INDENT = {
  child: { paddingLeft: "2rem" },
  detail: { paddingLeft: "3.75rem" },
} as const;

// 損益の符号に応じた文字色（0 は黒字扱い）
export const amountColor = (value: number) =>
  value < 0 ? "text-red-600" : "text-green-700";

// 行の展開状態（キーの集合）。種別が異なっても同名になりうるため、
// キーには種別のプレフィックスを付けて使う
export const useExpandedRows = () => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
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
  // 一括で開く / 閉じる（Issue #152。表ごとの「すべて開く」「すべて閉じる」）。
  // 種別の異なるキーが同じ集合に混在しうるため、渡したキーだけを開く / 閉じる
  // （他の種別の展開状態は変えない）
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

// 表の見出しに置く「すべて開く」「すべて閉じる」（Issue #152）。
// label は支援技術向けに対象の表を示す（例: 「案件別収支」）
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

// 展開可能な見出し行に共通で付ける属性。
// 行全体をクリックできる利便性は残す。キーボード・支援技術向けの操作点は
// セル内の実ボタン（ExpandToggle）が担う（<tr> に role="button" を付けると
// 行としてのセマンティクスが壊れるため、行側には role / tabIndex を付けない）。
export const expandableRowProps = (onToggle: () => void) => ({
  className: "cursor-pointer",
  onClick: onToggle,
});

// 見出し行の開閉トグル。native button なので Enter / Space が既定で効く。
// 行の onClick との二重トグルを避けるため伝播を止める。
export const ExpandToggle = ({
  isExpanded,
  onToggle,
  children,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-expanded={isExpanded}
    className="inline-flex items-center gap-2 text-left rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    onClick={(event) => {
      event.stopPropagation();
      onToggle();
    }}
  >
    {isExpanded ? (
      <FaChevronDown size="0.7rem" />
    ) : (
      <FaChevronRight size="0.7rem" />
    )}
    {children}
  </button>
);

// 調整あり・元データ変更検知のバッジ・警告（明細行の実績額の横に付ける）。
// 調整ありバッジは調整理由をツールチップで表示する（チームリーダーは調整理由を
// 閲覧できるが編集操作は表示されない、という仕様のため）。
// トリガーは native button にして、キーボード操作（Tab でフォーカス）でも
// 支援技術でも内容が伝わるようにする
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

// 実績額修正のある明細行の「元データ / 調整」の補足（調整が無い行は何も出さない）
export const adjustmentNote = (detail: AdjustableAmount): string | null =>
  detail.adjustmentAmount === 0
    ? null
    : `元データ ${formatCurrency(detail.sourceAmount)} / 調整 ${
        detail.adjustmentAmount > 0 ? "+" : ""
      }${formatCurrency(detail.adjustmentAmount)}`;

// 定期費用の補足表示（品目 / 支払サイクル / チーム）。
// 費目別内訳の配下では品目が見出しになるため includeItem=false で重複表示を避ける。
// 支払サイクルは月払い（既定）以外の場合のみ併記し、月払いの表示を煩雑にしない。
// チームは includeTeam のとき常に表示し、未指定（全体共通）も明示する
// （全体共通（参考）セクションはすでに見出しで示しているため includeTeam=false で呼ぶ）。
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

// 表示タイトル（Issue #150）の付随表示。上書き中は「名称変更」バッジ（元の名称を
// ツールチップで示す）を、onEdit があれば（経理担当者・管理者）編集アイコンを出す。
// タイトル本文と分けているのは、案件行のようにタイトル本文を展開ボタンの中に置く場合に
// ボタンの入れ子（対話要素の入れ子）を作らないため。
// チーム・分類・品目・費目の見出しと経理追加収支の行には使わない（タイトル変更の対象外）
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

// 表示タイトル本文 + 付随表示
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

// 明細行の「実績額を修正」ボタン。確定済みの月（Issue #148）は無効化し、
// 確定解除してから編集する旨をツールチップで示す（無効化したボタンはホバーイベントを
// 受けないため span で包む）
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
