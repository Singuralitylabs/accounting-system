"use client";

import { Alert, Table } from "@mantine/core";
import { useBudgetDeclarationDetail } from "@/app/hooks/useBudgetDeclarationData";
import {
  BUDGET_ENTRY_TYPE_LABELS,
  BudgetEntryType,
} from "@/app/utils/budgetDeclaration";
import { formatCurrency } from "@/app/utils/formatter";
import { LoadingSpinner } from "../LoadingSpinner";

type Props = {
  month: string; // "YYYY-MM"
  team: string;
};

// 一覧の行を開いたときに表示する明細（参照のみ）。
// 申告の作成・編集フォームは別 Issue（#87）で追加する。
const BudgetDeclarationItemTable = ({ month, team }: Props) => {
  const {
    data: detail,
    isLoading,
    isError,
  } = useBudgetDeclarationDetail(month, team);

  if (isError) {
    return (
      <Alert color="red" title="申告明細の取得に失敗しました">
        時間をおいてページを再読み込みしてください。
      </Alert>
    );
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!detail || detail.items.length === 0) {
    return (
      <Alert color="gray" title="明細がありません">
        このチーム・対象月には明細が登録されていません。
      </Alert>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>種別</Table.Th>
            <Table.Th>分類</Table.Th>
            <Table.Th>内容</Table.Th>
            <Table.Th className="text-right">金額</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {detail.items.map((item) => (
            <Table.Tr key={item.id}>
              <Table.Td>
                {BUDGET_ENTRY_TYPE_LABELS[item.entry_type as BudgetEntryType] ??
                  item.entry_type}
              </Table.Td>
              <Table.Td>{item.category}</Table.Td>
              <Table.Td>{item.description}</Table.Td>
              <Table.Td className="text-right">
                {formatCurrency(item.amount)}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {detail.declaration.comment && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
          コメント: {detail.declaration.comment}
        </p>
      )}
    </div>
  );
};

export default BudgetDeclarationItemTable;
