"use client";

import { TeamBreakdown } from "@/app/types/types";
import { formatCurrency } from "@/app/utils/formatter";
import { Paper, Table, Text } from "@mantine/core";
import { AmountList, AmountListRow, amountColor } from "./plTableParts";

type Props = {
  byTeam: TeamBreakdown[];
};

const teamAmountRows = (teamBreakdown: TeamBreakdown): AmountListRow[] => [
  { label: "売上", value: teamBreakdown.revenue },
  { label: "案件費用", value: teamBreakdown.matterCost },
  { label: "粗利", value: teamBreakdown.grossProfit, colorize: true },
  { label: "管理費", value: teamBreakdown.adminCost },
  {
    label: "経常利益",
    value: teamBreakdown.profit,
    colorize: true,
    bold: true,
    divider: true,
  },
];

// Per-team results (teamleader / accounting / admin). Mobile uses cards; aggregation: docs/specification.md 4.16.2.
const TeamProfitTable = ({ byTeam }: Props) => {
  if (byTeam.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        この月に計上される収支はありません。
      </Text>
    );
  }

  return (
    <>
      {/* Both layouts stay mounted. CSS picks one; a viewport hook would read width 0 on first paint. */}
      <div className="mb-6 hidden md:block">
        <Paper withBorder radius="md">
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>チーム別収支</Table.Th>
                <Table.Th className="text-right whitespace-nowrap">
                  売上
                </Table.Th>
                <Table.Th className="text-right whitespace-nowrap">
                  案件費用
                </Table.Th>
                <Table.Th className="text-right whitespace-nowrap">
                  粗利
                </Table.Th>
                <Table.Th className="text-right whitespace-nowrap">
                  管理費
                </Table.Th>
                <Table.Th className="text-right whitespace-nowrap">
                  経常利益
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {byTeam.map((teamBreakdown) => (
                <Table.Tr key={`team-${teamBreakdown.team}`}>
                  <Table.Td>{teamBreakdown.team}</Table.Td>
                  <Table.Td className="text-right whitespace-nowrap">
                    {formatCurrency(teamBreakdown.revenue)}
                  </Table.Td>
                  <Table.Td className="text-right whitespace-nowrap">
                    {formatCurrency(teamBreakdown.matterCost)}
                  </Table.Td>
                  <Table.Td
                    className={`text-right whitespace-nowrap ${amountColor(teamBreakdown.grossProfit)}`}
                  >
                    {formatCurrency(teamBreakdown.grossProfit)}
                  </Table.Td>
                  <Table.Td className="text-right whitespace-nowrap">
                    {formatCurrency(teamBreakdown.adminCost)}
                  </Table.Td>
                  <Table.Td
                    className={`text-right whitespace-nowrap font-bold ${amountColor(
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
      </div>
      <div
        className="mb-6 space-y-3 md:hidden"
        data-testid="team-profit-card-list"
      >
        {byTeam.map((teamBreakdown) => (
          <Paper
            key={`team-card-${teamBreakdown.team}`}
            withBorder
            radius="md"
            p="sm"
          >
            <Text fw={700} className="break-words">
              {teamBreakdown.team}
            </Text>
            <AmountList rows={teamAmountRows(teamBreakdown)} />
          </Paper>
        ))}
      </div>
    </>
  );
};

export default TeamProfitTable;
