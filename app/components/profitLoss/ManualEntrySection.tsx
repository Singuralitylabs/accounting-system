"use client";

import { ManualEntryType } from "@/app/types/types";
import { formatCurrency } from "@/app/utils/formatter";
import { formatEntryType } from "@/app/utils/manualEntry";
import { ORG_WIDE_TEAM_LABEL } from "@/app/utils/constants";
import { Badge, Button, Paper, Table, Text } from "@mantine/core";
import { useState } from "react";
import ManualEntryEditModal from "./ManualEntryEditModal";

type Props = {
  month: string; // "YYYY-MM"
  manualEntries: ManualEntryType[];
  canEdit: boolean; // accounting / admin のみ true
};

// 案件外収支の明細一覧。経理担当者・管理者には編集モーダルの起動ボタンを表示する。
// エントリが無い月でも、編集権限があれば追加の入口としてセクションを表示する。
const ManualEntrySection = ({ month, manualEntries, canEdit }: Props) => {
  const [isModalOpened, setIsModalOpened] = useState(false);

  if (manualEntries.length === 0 && !canEdit) {
    return null;
  }

  return (
    <Paper withBorder radius="md" className="overflow-x-auto mb-6 p-4">
      <div className="flex justify-between items-center mb-1">
        <Text fw={700}>案件外収支</Text>
        {canEdit && (
          <Button
            size="xs"
            variant="light"
            onClick={() => setIsModalOpened(true)}
          >
            編集
          </Button>
        )}
      </div>
      <Text size="xs" c="dimmed" className="mb-3">
        案件に紐づかない売上・費用です。上の損益計算書の売上合計・案件費用合計に算入されています。
      </Text>
      {manualEntries.length === 0 ? (
        <Text size="sm" c="dimmed" className="py-2">
          この月の案件外収支は登録されていません。
        </Text>
      ) : (
        <Table verticalSpacing="xs">
          <Table.Tbody>
            {manualEntries.map((entry) => (
              <Table.Tr key={`manual-${entry.id}`}>
                <Table.Td className="w-20">
                  <Badge
                    variant="light"
                    color={entry.entry_type === "revenue" ? "green" : "red"}
                  >
                    {formatEntryType(entry.entry_type)}
                  </Badge>
                </Table.Td>
                <Table.Td className="text-gray-700">
                  {entry.name}
                  <span className="text-xs text-gray-500 ml-2">
                    （{entry.category ?? entry.item} /{" "}
                    {entry.team ?? ORG_WIDE_TEAM_LABEL}）
                  </span>
                </Table.Td>
                <Table.Td className="text-right w-44">
                  {formatCurrency(entry.amount)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {canEdit && (
        <ManualEntryEditModal
          month={month}
          opened={isModalOpened}
          onClose={() => setIsModalOpened(false)}
        />
      )}
    </Paper>
  );
};

export default ManualEntrySection;
