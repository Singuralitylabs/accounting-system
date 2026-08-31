"use client";

import { ExtraEntryType } from "@/app/types/types";
import { ORG_WIDE_TEAM_LABEL } from "@/app/utils/constants";
import { formatEntryType } from "@/app/utils/extraEntry";
import { formatCurrency, formatDateToJp } from "@/app/utils/formatter";
import { Badge, Paper, Table, Text } from "@mantine/core";

type Props = {
  extraEntries: ExtraEntryType[];
};

// 経理追加収支の明細一覧。管理画面への導線は損益計算書ページ上部の
// AccountingMasterActions に集約したため、ここでは明細表示のみ行う。
const ExtraEntrySection = ({ extraEntries }: Props) => {
  if (extraEntries.length === 0) {
    return null;
  }

  return (
    <Paper withBorder radius="md" className="overflow-x-auto mb-6 p-4">
      <Text fw={700} className="mb-1">
        経理追加収支
      </Text>
      <Text size="xs" c="dimmed" className="mb-3">
        案件に紐づかない収入・支出です。上の損益計算書の売上合計・案件費用合計に算入されています。
      </Text>
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th className="w-20">種別</Table.Th>
            <Table.Th>内容</Table.Th>
            <Table.Th className="text-right w-36">請求額</Table.Th>
            <Table.Th className="text-right w-36">経費</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {extraEntries.map((entry) => (
            <Table.Tr key={`extra-${entry.id}`}>
              <Table.Td>
                <Badge
                  variant="light"
                  color={entry.entry_type === "income" ? "green" : "red"}
                >
                  {formatEntryType(entry.entry_type)}
                </Badge>
              </Table.Td>
              <Table.Td className="text-gray-700">
                {entry.description}
                <span className="text-xs text-gray-500 ml-2">
                  （{entry.category} / {entry.team ?? ORG_WIDE_TEAM_LABEL} /{" "}
                  {formatDateToJp(entry.entry_date)}）
                </span>
              </Table.Td>
              <Table.Td className="text-right">
                {entry.billing_amount !== null
                  ? formatCurrency(entry.billing_amount)
                  : "-"}
              </Table.Td>
              <Table.Td className="text-right">
                {entry.expense_amount !== null
                  ? formatCurrency(entry.expense_amount)
                  : "-"}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
};

export default ExtraEntrySection;
