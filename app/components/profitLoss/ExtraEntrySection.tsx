"use client";

import { ExtraEntryType } from "@/app/types/types";
import { ORG_WIDE_TEAM_LABEL } from "@/app/utils/constants";
import { formatEntryType } from "@/app/utils/extraEntry";
import { formatCurrency, formatDateToJp } from "@/app/utils/formatter";
import { Badge, Button, Paper, Table, Text } from "@mantine/core";
import Link from "next/link";

type Props = {
  extraEntries: ExtraEntryType[];
  canEdit: boolean; // accounting / admin のみ true
};

// 経理追加収支の明細一覧。経理担当者・管理者には経理追加収支画面への管理リンクを表示する。
// エントリが無い月でも、登録の入口として管理権限者にはセクションを表示する。
const ExtraEntrySection = ({ extraEntries, canEdit }: Props) => {
  if (extraEntries.length === 0 && !canEdit) {
    return null;
  }

  return (
    <Paper withBorder radius="md" className="overflow-x-auto mb-6 p-4">
      <div className="flex justify-between items-center mb-1">
        <Text fw={700}>経理追加収支</Text>
        {canEdit && (
          <Button
            component={Link}
            href="/extra-entries"
            size="xs"
            variant="light"
          >
            経理追加収支を管理
          </Button>
        )}
      </div>
      <Text size="xs" c="dimmed" className="mb-3">
        案件に紐づかない収入・支出です。上の損益計算書の売上合計・案件費用合計に算入されています。
      </Text>
      {extraEntries.length === 0 ? (
        <Text size="sm" c="dimmed" className="py-2">
          この月の経理追加収支はありません。
        </Text>
      ) : (
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
      )}
    </Paper>
  );
};

export default ExtraEntrySection;
