"use client";

import { ExtraEntryLine } from "@/app/types/types";
import { teamLabel } from "@/app/utils/constants";
import { formatEntryType } from "@/app/utils/extraEntry";
import { formatCurrency, formatDateToJp } from "@/app/utils/formatter";
import { Badge, Paper, Table, Text } from "@mantine/core";

type Props = {
  extraEntries: ExtraEntryLine[];
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
        案件に紐づかない収入・支出です。売上合計・案件費用合計（売上総利益）と、分類別・チーム別の収支に算入されています（案件別収支には含みません）。
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
            <Table.Tr key={`extra-${entry.extraEntryId}`}>
              <Table.Td>
                <Badge
                  variant="light"
                  color={entry.entryType === "income" ? "green" : "red"}
                >
                  {formatEntryType(entry.entryType)}
                </Badge>
              </Table.Td>
              <Table.Td className="text-gray-700">
                {entry.description}
                <span className="text-xs text-gray-500 ml-2">
                  （{entry.category} / {teamLabel(entry.team)} /{" "}
                  {formatDateToJp(entry.entryDate)}）
                </span>
              </Table.Td>
              <Table.Td className="text-right">
                {entry.billingAmount !== null
                  ? formatCurrency(entry.billingAmount)
                  : "-"}
              </Table.Td>
              <Table.Td className="text-right">
                {entry.expenseAmount !== null
                  ? formatCurrency(entry.expenseAmount)
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
