"use client";

import { AnnualTrendType } from "@/app/types/types";
import { formatCurrency } from "@/app/utils/formatter";
import { Paper, Table } from "@mantine/core";

type Props = {
  trend: AnnualTrendType;
};

// 月キー（YYYY-MM）を「M月」表記にする
const formatMonthHeader = (month: string) =>
  `${parseInt(month.slice(5, 7), 10)}月`;

const AnnualTrendTable = ({ trend }: Props) => {
  const rows: {
    label: string;
    getValue: (month: AnnualTrendType["months"][number]) => number;
    isProfit?: boolean;
  }[] = [
    { label: "売上", getValue: (m) => m.revenueTotal },
    { label: "案件費用", getValue: (m) => m.matterCostTotal },
    { label: "管理費", getValue: (m) => m.recurringCostTotal },
    { label: "営業損益", getValue: (m) => m.operatingProfit, isProfit: true },
  ];

  const totalRowValues = rows.map((row) =>
    trend.months.reduce((sum, month) => sum + row.getValue(month), 0)
  );

  return (
    <Paper withBorder radius="md" className="overflow-x-auto">
      <Table verticalSpacing="sm" highlightOnHover className="whitespace-nowrap">
        <Table.Thead>
          <Table.Tr>
            <Table.Th className="sticky left-0 bg-white z-10">
              {trend.fiscalYear}年度
            </Table.Th>
            {trend.months.map((month) => (
              <Table.Th key={month.month} className="text-right">
                {formatMonthHeader(month.month)}
              </Table.Th>
            ))}
            <Table.Th className="text-right bg-slate-50">年度合計</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row, rowIndex) => (
            <Table.Tr
              key={row.label}
              className={row.isProfit ? "border-t-2 border-gray-400" : ""}
            >
              <Table.Td
                className={`sticky left-0 bg-white z-10 ${
                  row.isProfit ? "font-bold" : ""
                }`}
              >
                {row.label}
              </Table.Td>
              {trend.months.map((month) => {
                const value = row.getValue(month);
                return (
                  <Table.Td
                    key={`${row.label}-${month.month}`}
                    className={`text-right ${
                      row.isProfit
                        ? `font-bold ${
                            value < 0 ? "text-red-600" : "text-green-700"
                          }`
                        : ""
                    }`}
                  >
                    {formatCurrency(value)}
                  </Table.Td>
                );
              })}
              <Table.Td
                className={`text-right bg-slate-50 font-bold ${
                  row.isProfit
                    ? totalRowValues[rowIndex] < 0
                      ? "text-red-600"
                      : "text-green-700"
                    : ""
                }`}
              >
                {formatCurrency(totalRowValues[rowIndex])}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
};

export default AnnualTrendTable;
