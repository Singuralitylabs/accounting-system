"use client";

import { AnnualTrendType } from "@/app/types/types";
import { formatCurrency, formatMonthHeader } from "@/app/utils/formatter";
import { Paper, Table, Text, Tooltip } from "@mantine/core";
import { FaExclamationTriangle, FaLock } from "react-icons/fa";
import { amountColor } from "./plTableParts";
import ClosingDiffScopeNote, {
  isClosedMonthBeforeDiffScope,
} from "./ClosingDiffScopeNote";

type Props = {
  trend: AnnualTrendType;
  // Month -> count of unapplied changes after closing (accounting/admin only).
  diffCountByMonth?: ReadonlyMap<string, number>;
  // Start month of the count (accounting/admin only); no alert icon before it, so note the scope when the fiscal year has such months.
  diffScopeFromMonth?: string;
};

// Closed-month column background: semi-transparent so row hover (highlightOnHover) shows through; distinguishable from the fiscal-year total column (bg-slate-50).
export const CLOSED_MONTH_COLUMN_CLASS = "bg-teal-100/40";

const AnnualTrendTable = ({
  trend,
  diffCountByMonth = new Map<string, number>(),
  diffScopeFromMonth,
}: Props) => {
  const rows: {
    label: string;
    getValue: (month: AnnualTrendType["months"][number]) => number;
    colorBySign?: boolean;
    isProfit?: boolean;
  }[] = [
    { label: "売上", getValue: (m) => m.revenueTotal },
    { label: "案件費用", getValue: (m) => m.matterCostTotal },
    { label: "粗利", getValue: (m) => m.grossProfitTotal, colorBySign: true },
    { label: "管理費", getValue: (m) => m.adminCostTotal },
    {
      label: "経常利益",
      getValue: (m) => m.ordinaryProfit,
      colorBySign: true,
      isProfit: true,
    },
  ];

  const totalRowValues = rows.map((row) =>
    trend.months.reduce((sum, month) => sum + row.getValue(month), 0),
  );

  const closedColumnClass = (month: AnnualTrendType["months"][number]) =>
    month.closing ? CLOSED_MONTH_COLUMN_CLASS : "";
  const hasClosedMonth = trend.months.some((month) => month.closing);
  const hasClosedMonthBeforeDiffScope = trend.months.some((month) =>
    isClosedMonthBeforeDiffScope(
      month.month,
      Boolean(month.closing),
      diffScopeFromMonth,
    ),
  );

  return (
    <>
      {hasClosedMonth && (
        <Text size="xs" c="dimmed" className="mb-2 flex items-center gap-1">
          <span
            className={`inline-block w-3 h-3 rounded-sm border border-teal-200 ${CLOSED_MONTH_COLUMN_CLASS}`}
            aria-hidden
          />
          色付きの列は確定済みの月（確定値を表示）です
        </Text>
      )}
      {diffScopeFromMonth && hasClosedMonthBeforeDiffScope && (
        <ClosingDiffScopeNote fromMonth={diffScopeFromMonth} className="mb-2" />
      )}
      <Paper withBorder radius="md" className="overflow-x-auto">
        <Table
          verticalSpacing="sm"
          highlightOnHover
          className="whitespace-nowrap"
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="sticky left-0 bg-white z-10">
                {trend.fiscalYear}年度
              </Table.Th>
              {trend.months.map((month) => (
                <Table.Th
                  key={month.month}
                  className={`text-right ${closedColumnClass(month)}`}
                >
                  {month.closing && (
                    <Tooltip label="確定済み（確定値を表示）">
                      <span
                        className="inline-flex mr-1 text-teal-700 align-middle"
                        aria-label="確定済み"
                        role="img"
                      >
                        <FaLock size="0.65rem" />
                      </span>
                    </Tooltip>
                  )}
                  {diffCountByMonth.has(month.month) && (
                    <Tooltip
                      label={`確定後に未反映の変更があります（${diffCountByMonth.get(month.month)}件）`}
                    >
                      <span
                        className="inline-flex mr-1 text-orange-600 align-middle"
                        aria-label="確定後に未反映の変更があります"
                        role="img"
                      >
                        <FaExclamationTriangle size="0.65rem" />
                      </span>
                    </Tooltip>
                  )}
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
                      className={`text-right ${row.isProfit ? "font-bold" : ""} ${
                        row.colorBySign ? amountColor(value) : ""
                      } ${closedColumnClass(month)}`}
                    >
                      {formatCurrency(value)}
                    </Table.Td>
                  );
                })}
                <Table.Td
                  className={`text-right bg-slate-50 font-bold ${
                    row.colorBySign ? amountColor(totalRowValues[rowIndex]) : ""
                  }`}
                >
                  {formatCurrency(totalRowValues[rowIndex])}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </>
  );
};

export default AnnualTrendTable;
