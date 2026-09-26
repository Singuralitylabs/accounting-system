"use client";

import { GrossProfitBreakdown } from "@/app/types/types";
import { formatCurrency } from "@/app/utils/formatter";
import { Paper, Table } from "@mantine/core";
import { amountColor } from "./plTableParts";

type Props = {
  breakdown: GrossProfitBreakdown[];
  revenueTotal: number;
  matterCostTotal: number;
  grossProfitTotal: number;
};

// 分類別収支（収支の内訳タブの「分類別」。Issue #147 / #152）。
// 振り分けは docs/specification.md 4.16.2「分類別収支の振り分けルール」。
// 合計は売上総利益（案件 ＋ 経理追加収支）と必ず一致する。明細への展開は持たない（明細は案件別収支で確認する）
const CategoryProfitTable = ({
  breakdown,
  revenueTotal,
  matterCostTotal,
  grossProfitTotal,
}: Props) => (
  <Paper withBorder radius="md" className="overflow-x-auto mb-6">
    <Table verticalSpacing="sm" highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>分類別収支</Table.Th>
          <Table.Th className="text-right w-32">売上</Table.Th>
          <Table.Th className="text-right w-32">案件費用</Table.Th>
          <Table.Th className="text-right w-32">粗利</Table.Th>
          <Table.Th className="w-36" />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {breakdown.map((row) => (
          <Table.Tr key={`category-${row.category}`}>
            <Table.Td className="text-gray-700">{row.category}</Table.Td>
            <Table.Td className="text-right">
              {formatCurrency(row.revenue)}
            </Table.Td>
            <Table.Td className="text-right">
              {formatCurrency(row.cost)}
            </Table.Td>
            <Table.Td className={`text-right ${amountColor(row.grossProfit)}`}>
              {formatCurrency(row.grossProfit)}
            </Table.Td>
            <Table.Td />
          </Table.Tr>
        ))}
        <Table.Tr className="bg-slate-100 border-t-2 border-gray-300">
          <Table.Td className="font-bold">合計</Table.Td>
          <Table.Td className="text-right font-bold">
            {formatCurrency(revenueTotal)}
          </Table.Td>
          <Table.Td className="text-right font-bold">
            {formatCurrency(matterCostTotal)}
          </Table.Td>
          <Table.Td
            className={`text-right font-bold ${amountColor(grossProfitTotal)}`}
          >
            {formatCurrency(grossProfitTotal)}
          </Table.Td>
          <Table.Td />
        </Table.Tr>
      </Table.Tbody>
    </Table>
  </Paper>
);

export default CategoryProfitTable;
