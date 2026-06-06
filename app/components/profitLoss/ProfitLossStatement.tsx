"use client";

import {
  MatterInfoWithUserNameType,
  PLReportType,
  RecurringCostType,
} from "@/app/types/types";
import { getMatterInfoById } from "@/app/utils/supabase/profitLossReport";
import { formatCurrency, formatMonthLabel } from "@/app/utils/formatter";
import { formatPaymentCycle } from "@/app/utils/paymentCycle";
import { Alert, Button, Paper, SimpleGrid, Table, Text } from "@mantine/core";
import { Fragment, useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { MatterCardDetailModalReadOnly } from "../modal/MatterCardDetailReadOnly";

type Props = {
  report: PLReportType;
};

// 定期費用の補足表示（品目 / 支払サイクル / チーム）
const formatRecurringCostNote = (
  recurringCost: RecurringCostType,
  includeTeam: boolean
) => {
  const parts = [recurringCost.item];
  if (recurringCost.payment_cycle !== "monthly") {
    parts.push(formatPaymentCycle(recurringCost.payment_cycle));
  }
  if (includeTeam && recurringCost.team) {
    parts.push(recurringCost.team);
  }
  return `（${parts.join(" / ")}）`;
};

const ProfitLossStatement = ({ report }: Props) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedMatter, setSelectedMatter] =
    useState<MatterInfoWithUserNameType | null>(null);
  const [isModalOpened, setIsModalOpened] = useState(false);
  const [loadingMatterId, setLoadingMatterId] = useState<number | null>(null);

  const toggleItem = (item: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      return next;
    });
  };

  const handleShowMatter = async (matterId: number) => {
    try {
      setLoadingMatterId(matterId);
      const { matterInfo, error } = await getMatterInfoById(matterId);
      if (error || !matterInfo) {
        alert("案件情報の取得に失敗しました。");
        return;
      }
      setSelectedMatter(matterInfo);
      setIsModalOpened(true);
    } finally {
      setLoadingMatterId(null);
    }
  };

  const profitColor =
    report.operatingProfit < 0 ? "text-red-600" : "text-green-700";

  const hasUndated = report.undated.revenue > 0 || report.undated.matterCost > 0;

  const summaryCards = [
    { label: "売上", value: report.revenueTotal, color: "text-green-700" },
    {
      label: "案件費用",
      value: report.matterCostTotal,
      color: "text-red-600",
    },
    {
      label: "管理費",
      value: report.recurringCostTotal,
      color: "text-red-600",
    },
    { label: "営業損益", value: report.operatingProfit, color: profitColor },
  ];

  return (
    <div>
      {/* サマリーカード */}
      <SimpleGrid cols={{ base: 2, md: 4 }} className="mb-6">
        {summaryCards.map((card) => (
          <Paper key={card.label} withBorder p="md" radius="md">
            <Text size="sm" c="dimmed">
              {card.label}
            </Text>
            <Text fw={700} size="lg" className={card.color}>
              {formatCurrency(card.value)}
            </Text>
          </Paper>
        ))}
      </SimpleGrid>

      {/* 損益計算書テーブル */}
      <Paper withBorder radius="md" className="overflow-x-auto mb-6">
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{formatMonthLabel(report.month)} 損益計算書</Table.Th>
              <Table.Th className="text-right w-44">金額</Table.Th>
              <Table.Th className="w-24" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {/* 売上合計 */}
            <Table.Tr className="bg-slate-50">
              <Table.Td className="font-bold">売上合計</Table.Td>
              <Table.Td className="text-right font-bold">
                {formatCurrency(report.revenueTotal)}
              </Table.Td>
              <Table.Td />
            </Table.Tr>
            {report.revenueByCategory.map((breakdown) => (
              <Table.Tr key={`revenue-${breakdown.category}`}>
                <Table.Td className="pl-8 text-gray-700">
                  {breakdown.category}
                </Table.Td>
                <Table.Td className="text-right">
                  {formatCurrency(breakdown.amount)}
                </Table.Td>
                <Table.Td />
              </Table.Tr>
            ))}

            {/* 案件費用合計 */}
            <Table.Tr className="bg-slate-50">
              <Table.Td className="font-bold">案件費用合計</Table.Td>
              <Table.Td className="text-right font-bold">
                {formatCurrency(report.matterCostTotal)}
              </Table.Td>
              <Table.Td />
            </Table.Tr>
            {report.matterCostByItem.map((breakdown) => (
              <Fragment key={`item-${breakdown.item}`}>
                <Table.Tr
                  className="cursor-pointer"
                  onClick={() => toggleItem(breakdown.item)}
                >
                  <Table.Td className="pl-8 text-gray-700">
                    <span className="inline-flex items-center gap-2">
                      {expandedItems.has(breakdown.item) ? (
                        <FaChevronDown size="0.7rem" />
                      ) : (
                        <FaChevronRight size="0.7rem" />
                      )}
                      {breakdown.item}
                    </span>
                  </Table.Td>
                  <Table.Td className="text-right">
                    {formatCurrency(breakdown.amount)}
                  </Table.Td>
                  <Table.Td />
                </Table.Tr>
                {expandedItems.has(breakdown.item) &&
                  breakdown.matters.map((matter) => (
                    <Table.Tr
                      key={`item-${breakdown.item}-matter-${matter.matterId}`}
                      className="bg-gray-50"
                    >
                      <Table.Td className="pl-16 text-gray-600">
                        {matter.matterTitle}
                      </Table.Td>
                      <Table.Td className="text-right text-gray-600">
                        {formatCurrency(matter.amount)}
                      </Table.Td>
                      <Table.Td className="text-center">
                        <Button
                          size="xs"
                          variant="light"
                          loading={loadingMatterId === matter.matterId}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleShowMatter(matter.matterId);
                          }}
                        >
                          案件を表示
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
              </Fragment>
            ))}

            {/* 管理費合計 */}
            <Table.Tr className="bg-slate-50">
              <Table.Td className="font-bold">管理費合計</Table.Td>
              <Table.Td className="text-right font-bold">
                {formatCurrency(report.recurringCostTotal)}
              </Table.Td>
              <Table.Td />
            </Table.Tr>
            {report.recurringCostDetails.map((recurringCost) => (
              <Table.Tr key={`recurring-${recurringCost.id}`}>
                <Table.Td className="pl-8 text-gray-700">
                  {recurringCost.name}
                  <span className="text-xs text-gray-500 ml-2">
                    {formatRecurringCostNote(recurringCost, true)}
                  </span>
                </Table.Td>
                <Table.Td className="text-right">
                  {formatCurrency(recurringCost.price)}
                </Table.Td>
                <Table.Td />
              </Table.Tr>
            ))}

            {/* 営業損益 */}
            <Table.Tr className="bg-slate-100 border-t-2 border-gray-400">
              <Table.Td className="font-bold text-lg">営業損益</Table.Td>
              <Table.Td className={`text-right font-bold text-lg ${profitColor}`}>
                {formatCurrency(report.operatingProfit)}
              </Table.Td>
              <Table.Td />
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Paper>

      {/* 全体共通（参考）: teamleader のみデータが入る */}
      {report.orgWideRecurringCosts &&
        report.orgWideRecurringCosts.length > 0 && (
          <Paper withBorder radius="md" className="overflow-x-auto mb-6 p-4">
            <Text fw={700} className="mb-1">
              全体共通の管理費（参考）
            </Text>
            <Text size="xs" c="dimmed" className="mb-3">
              チーム表示には全体共通の管理費は含まれません。
            </Text>
            <Table verticalSpacing="xs">
              <Table.Tbody>
                {report.orgWideRecurringCosts.map((recurringCost) => (
                  <Table.Tr key={`orgwide-${recurringCost.id}`}>
                    <Table.Td className="text-gray-700">
                      {recurringCost.name}
                      <span className="text-xs text-gray-500 ml-2">
                        {formatRecurringCostNote(recurringCost, false)}
                      </span>
                    </Table.Td>
                    <Table.Td className="text-right w-44">
                      {formatCurrency(recurringCost.price)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        )}

      {/* チーム別内訳: accounting / admin のみデータが入る */}
      {report.byTeam && report.byTeam.length > 0 && (
        <Paper withBorder radius="md" className="overflow-x-auto mb-6">
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>チーム別内訳</Table.Th>
                <Table.Th className="text-right">売上</Table.Th>
                <Table.Th className="text-right">案件費用</Table.Th>
                <Table.Th className="text-right">管理費</Table.Th>
                <Table.Th className="text-right">損益</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {report.byTeam.map((teamBreakdown) => (
                <Table.Tr key={`team-${teamBreakdown.team}`}>
                  <Table.Td>{teamBreakdown.team}</Table.Td>
                  <Table.Td className="text-right">
                    {formatCurrency(teamBreakdown.revenue)}
                  </Table.Td>
                  <Table.Td className="text-right">
                    {formatCurrency(teamBreakdown.matterCost)}
                  </Table.Td>
                  <Table.Td className="text-right">
                    {formatCurrency(teamBreakdown.recurringCost)}
                  </Table.Td>
                  <Table.Td
                    className={`text-right font-bold ${
                      teamBreakdown.profit < 0
                        ? "text-red-600"
                        : "text-green-700"
                    }`}
                  >
                    {formatCurrency(teamBreakdown.profit)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      {/* 月未確定 */}
      {hasUndated && (
        <Alert color="yellow" title="月未確定のデータがあります">
          請求日・支払い期限が未入力のため、月次集計に含まれていないデータがあります（売上:
          {formatCurrency(report.undated.revenue)} / 案件費用:
          {formatCurrency(report.undated.matterCost)}）。
        </Alert>
      )}

      {/* 案件詳細モーダル（閲覧専用） */}
      {selectedMatter && (
        <MatterCardDetailModalReadOnly
          matterInfo={selectedMatter}
          opened={isModalOpened}
          setOpened={setIsModalOpened}
        />
      )}
    </div>
  );
};

export default ProfitLossStatement;
