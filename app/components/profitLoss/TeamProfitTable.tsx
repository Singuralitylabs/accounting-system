"use client";

import { TeamBreakdown } from "@/app/types/types";
import { formatCurrency } from "@/app/utils/formatter";
import { Paper, Table, Text } from "@mantine/core";
import { amountColor } from "./plTableParts";

type Props = {
  byTeam: TeamBreakdown[];
};

// チーム別収支（収支の内訳タブの「チーム別」。accounting / admin のみ。Issue #152）。
// 集計は docs/specification.md 4.16.2（明細行ごとのチーム + 経理追加収支のチーム）
const TeamProfitTable = ({ byTeam }: Props) => {
  if (byTeam.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        この月に計上される収支はありません。
      </Text>
    );
  }

  return (
    <Paper withBorder radius="md" className="overflow-x-auto mb-6">
      <Table verticalSpacing="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>チーム別収支</Table.Th>
            <Table.Th className="text-right">売上</Table.Th>
            <Table.Th className="text-right">案件費用</Table.Th>
            <Table.Th className="text-right">粗利</Table.Th>
            <Table.Th className="text-right">管理費</Table.Th>
            <Table.Th className="text-right">経常利益</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {byTeam.map((teamBreakdown) => (
            <Table.Tr key={`team-${teamBreakdown.team}`}>
              <Table.Td>{teamBreakdown.team}</Table.Td>
              <Table.Td className="text-right">
                {formatCurrency(teamBreakdown.revenue)}
              </Table.Td>
              <Table.Td className="text-right">
                {formatCurrency(teamBreakdown.matterCost)}
              </Table.Td>
              <Table.Td
                className={`text-right ${amountColor(teamBreakdown.grossProfit)}`}
              >
                {formatCurrency(teamBreakdown.grossProfit)}
              </Table.Td>
              <Table.Td className="text-right">
                {formatCurrency(teamBreakdown.recurringCost)}
              </Table.Td>
              <Table.Td
                className={`text-right font-bold ${amountColor(
                  teamBreakdown.profit,
                )}`}
              >
                {formatCurrency(teamBreakdown.profit)}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
};

export default TeamProfitTable;
