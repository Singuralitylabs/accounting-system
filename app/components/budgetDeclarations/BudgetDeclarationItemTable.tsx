"use client";

import { Alert, Table } from "@mantine/core";
import { useBudgetDeclarationDetail } from "@/app/hooks/useBudgetDeclarationData";
import {
  budgetAmountColor,
  budgetEntryRowBg,
} from "@/app/utils/budgetDeclaration";
import { formatEntryType } from "@/app/utils/extraEntry";
import { formatCurrency } from "@/app/utils/formatter";
import { LoadingSpinner } from "../LoadingSpinner";

type Props = {
  declarationId: number;
};

// Shown regardless of items (a declaration with 0 items is valid).
const Comment = ({ comment }: { comment: string | null }) =>
  comment ? (
    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
      コメント: {comment}
    </p>
  ) : null;

const BudgetDeclarationItemTable = ({ declarationId }: Props) => {
  const {
    data: detail,
    isLoading,
    isError,
    error,
  } = useBudgetDeclarationDetail(declarationId);

  if (isError) {
    return (
      <Alert color="red" title="申告明細の取得に失敗しました">
        {error.message}
      </Alert>
    );
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!detail) {
    return (
      <Alert color="gray" title="申告が見つかりません">
        別のユーザーが削除した可能性があります。ページを再読み込みしてください。
      </Alert>
    );
  }

  // Header exists but 0 items; a comment may still be registered.
  if (detail.items.length === 0) {
    return (
      <>
        <Alert color="gray" title="明細がありません">
          この申告には明細が登録されていません。
        </Alert>
        <Comment comment={detail.comment} />
      </>
    );
  }

  // Both layouts stay in the DOM and CSS picks one (no viewport-size hook: its first render sees width 0).
  return (
    <div>
      <div className="hidden overflow-x-auto md:block">
        <Table withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>種別</Table.Th>
              <Table.Th>分類</Table.Th>
              <Table.Th>内容</Table.Th>
              <Table.Th className="text-right">金額</Table.Th>
              <Table.Th>担当者</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {detail.items.map((item) => (
              <Table.Tr key={item.id} bg={budgetEntryRowBg(item.entry_type)}>
                <Table.Td>{formatEntryType(item.entry_type)}</Table.Td>
                <Table.Td>{item.category}</Table.Td>
                <Table.Td>{item.description}</Table.Td>
                <Table.Td
                  className="text-right"
                  style={{ color: budgetAmountColor(item.entry_type) }}
                >
                  {formatCurrency(item.amount)}
                </Table.Td>
                <Table.Td>{item.managerName ?? "-"}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
      <ul
        className="m-0 list-none border border-gray-200 p-0 md:hidden"
        data-testid="budget-item-list-mobile"
      >
        {detail.items.map((item) => (
          <li
            key={item.id}
            className="border-b border-gray-200 px-3 py-2 last:border-b-0"
            style={{ backgroundColor: budgetEntryRowBg(item.entry_type) }}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-words text-sm">
                {item.description}
              </span>
              <span
                className="shrink-0 whitespace-nowrap text-sm font-semibold"
                style={{ color: budgetAmountColor(item.entry_type) }}
              >
                {formatCurrency(item.amount)}
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-600">
              {formatEntryType(item.entry_type)}・{item.category}・
              {item.managerName ?? "-"}
            </div>
          </li>
        ))}
      </ul>
      <Comment comment={detail.comment} />
    </div>
  );
};

export default BudgetDeclarationItemTable;
