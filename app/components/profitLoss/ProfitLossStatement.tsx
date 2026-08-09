"use client";

import {
  ExtraEntryType,
  MatterInfoWithUserNameType,
  PLReportType,
  RecurringCostType,
} from "@/app/types/types";
import { getMatterInfoById } from "@/app/utils/supabase/profitLossReport";
import { formatCurrency, formatMonthLabel } from "@/app/utils/formatter";
import { formatEntryType } from "@/app/utils/extraEntry";
import { formatPaymentCycle } from "@/app/utils/paymentCycle";
import { Alert, Button, Paper, SimpleGrid, Table, Text } from "@mantine/core";
import { Fragment, useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { MatterCardDetailModalReadOnly } from "../modal/MatterCardDetailReadOnly";
import ExtraEntrySection from "./ExtraEntrySection";

type Props = {
  report: PLReportType;
};

// 経理追加収支の金額1件分の表示行（全体共通（参考）セクション用）。
// 収入エントリは請求額と経費（任意）の最大2行に分解する。
type ExtraEntryAmountLine = {
  key: string;
  description: string;
  note: string;
  amount: number;
};

const toExtraEntryAmountLines = (
  entry: ExtraEntryType,
): ExtraEntryAmountLine[] => {
  const lines: ExtraEntryAmountLine[] = [];
  if (entry.entry_type === "income") {
    lines.push({
      key: `extra-${entry.id}-billing`,
      description: entry.description,
      note: `（${formatEntryType(entry.entry_type)}・請求額 / ${entry.category}）`,
      amount: entry.billing_amount ?? 0,
    });
  }
  if (entry.expense_amount !== null) {
    lines.push({
      key: `extra-${entry.id}-expense`,
      description: entry.description,
      note: `（${formatEntryType(entry.entry_type)}・経費 / ${entry.category}）`,
      amount: entry.expense_amount,
    });
  }
  return lines;
};

// 定期費用の補足表示（品目 / 支払サイクル / チーム）。
// 費目別内訳の配下では品目が見出しになるため includeItem=false で重複表示を避ける。
const formatRecurringCostNote = (
  recurringCost: RecurringCostType,
  { includeItem, includeTeam }: { includeItem: boolean; includeTeam: boolean },
) => {
  const parts = includeItem ? [recurringCost.item] : [];
  if (recurringCost.payment_cycle !== "monthly") {
    parts.push(formatPaymentCycle(recurringCost.payment_cycle));
  }
  if (includeTeam && recurringCost.team) {
    parts.push(recurringCost.team);
  }
  return parts.length > 0 ? `（${parts.join(" / ")}）` : "";
};

// 損益の符号に応じた文字色（0 は黒字扱い）
const amountColor = (value: number) =>
  value < 0 ? "text-red-600" : "text-green-700";

const ProfitLossStatement = ({ report }: Props) => {
  // 案件費用の品目行・管理費の費目行の展開状態。
  // 同名の品目が両方に存在しうるため、キーには種別のプレフィックスを付ける。
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedMatter, setSelectedMatter] =
    useState<MatterInfoWithUserNameType | null>(null);
  const [isModalOpened, setIsModalOpened] = useState(false);
  const [loadingMatterId, setLoadingMatterId] = useState<number | null>(null);

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
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

  const hasUndated =
    report.undated.revenue > 0 || report.undated.matterCost > 0;

  const summaryCards = [
    { label: "売上", value: report.revenueTotal, color: "text-green-700" },
    {
      label: "案件費用",
      value: report.matterCostTotal,
      color: "text-red-600",
    },
    {
      label: "粗利",
      value: report.grossProfitTotal,
      color: amountColor(report.grossProfitTotal),
    },
    {
      label: "管理費",
      value: report.recurringCostTotal,
      color: "text-red-600",
    },
    {
      label: "経常利益",
      value: report.ordinaryProfit,
      color: amountColor(report.ordinaryProfit),
    },
  ];

  return (
    <div>
      {/* サマリーカード */}
      <SimpleGrid cols={{ base: 2, md: 5 }} className="mb-6">
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
            {report.matterCostByItem.map((breakdown) => {
              const rowKey = `cost:${breakdown.item}`;
              const isExpanded = expandedRows.has(rowKey);
              return (
                <Fragment key={rowKey}>
                  <Table.Tr
                    className="cursor-pointer"
                    onClick={() => toggleRow(rowKey)}
                  >
                    <Table.Td className="pl-8 text-gray-700">
                      <span className="inline-flex items-center gap-2">
                        {isExpanded ? (
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
                  {isExpanded && (
                    <>
                      {breakdown.matters.map((matter) => (
                        <Table.Tr
                          key={`${rowKey}-matter-${matter.matterId}`}
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
                      {/* 経理追加収支の経費明細行（案件に紐づかないため「案件を表示」ボタンなし） */}
                      {breakdown.extraEntries.map((entry) => (
                        <Table.Tr
                          key={`${rowKey}-extra-${entry.id}`}
                          className="bg-gray-50"
                        >
                          <Table.Td className="pl-16 text-gray-600">
                            {entry.description}
                            <span className="text-xs text-gray-500 ml-2">
                              （経理追加）
                            </span>
                          </Table.Td>
                          <Table.Td className="text-right text-gray-600">
                            {formatCurrency(entry.expense_amount)}
                          </Table.Td>
                          <Table.Td />
                        </Table.Tr>
                      ))}
                    </>
                  )}
                </Fragment>
              );
            })}

            {/* 売上総利益（粗利）: 分類別に 売上 − 案件費用 を集計 */}
            <Table.Tr className="bg-slate-50 border-t-2 border-gray-300">
              <Table.Td className="font-bold">売上総利益（粗利）</Table.Td>
              <Table.Td
                className={`text-right font-bold ${amountColor(
                  report.grossProfitTotal,
                )}`}
              >
                {formatCurrency(report.grossProfitTotal)}
              </Table.Td>
              <Table.Td />
            </Table.Tr>
            {report.grossProfitByCategory.map((breakdown) => (
              <Table.Tr key={`gross-${breakdown.category}`}>
                <Table.Td className="pl-8 text-gray-700">
                  {breakdown.category}
                  <span className="text-xs text-gray-500 ml-2">
                    （売上 {formatCurrency(breakdown.revenue)} − 案件費用{" "}
                    {formatCurrency(breakdown.cost)}）
                  </span>
                </Table.Td>
                <Table.Td
                  className={`text-right ${amountColor(breakdown.grossProfit)}`}
                >
                  {formatCurrency(breakdown.grossProfit)}
                </Table.Td>
                <Table.Td />
              </Table.Tr>
            ))}

            {/* 管理費合計（費目別内訳。展開で定期費用の明細を表示） */}
            <Table.Tr className="bg-slate-50">
              <Table.Td className="font-bold">管理費合計</Table.Td>
              <Table.Td className="text-right font-bold">
                {formatCurrency(report.recurringCostTotal)}
              </Table.Td>
              <Table.Td />
            </Table.Tr>
            {report.recurringCostByItem.map((breakdown) => {
              const rowKey = `recurring:${breakdown.item}`;
              const isExpanded = expandedRows.has(rowKey);
              return (
                <Fragment key={rowKey}>
                  <Table.Tr
                    className="cursor-pointer"
                    onClick={() => toggleRow(rowKey)}
                  >
                    <Table.Td className="pl-8 text-gray-700">
                      <span className="inline-flex items-center gap-2">
                        {isExpanded ? (
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
                  {isExpanded &&
                    breakdown.details.map((recurringCost) => (
                      <Table.Tr
                        key={`${rowKey}-detail-${recurringCost.id}`}
                        className="bg-gray-50"
                      >
                        <Table.Td className="pl-16 text-gray-600">
                          {recurringCost.name}
                          <span className="text-xs text-gray-500 ml-2">
                            {formatRecurringCostNote(recurringCost, {
                              includeItem: false,
                              includeTeam: true,
                            })}
                          </span>
                        </Table.Td>
                        <Table.Td className="text-right text-gray-600">
                          {formatCurrency(recurringCost.price)}
                        </Table.Td>
                        <Table.Td />
                      </Table.Tr>
                    ))}
                </Fragment>
              );
            })}

            {/* 経常利益 = 粗利合計 − 管理費合計 */}
            <Table.Tr className="bg-slate-100 border-t-2 border-gray-400">
              <Table.Td className="font-bold text-lg">経常利益</Table.Td>
              <Table.Td
                className={`text-right font-bold text-lg ${amountColor(
                  report.ordinaryProfit,
                )}`}
              >
                {formatCurrency(report.ordinaryProfit)}
              </Table.Td>
              <Table.Td />
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Paper>

      {/* 経理追加収支: 明細一覧（accounting / admin には管理リンクを表示） */}
      <ExtraEntrySection
        extraEntries={report.extraEntries}
        canEdit={report.canEditExtraEntries}
      />

      {/* 全体共通（参考）: teamleader のみデータが入る */}
      {((report.orgWideRecurringCosts &&
        report.orgWideRecurringCosts.length > 0) ||
        (report.orgWideExtraEntries &&
          report.orgWideExtraEntries.length > 0)) && (
        <Paper withBorder radius="md" className="overflow-x-auto mb-6 p-4">
          <Text fw={700} className="mb-1">
            全体共通の管理費・経理追加収支（参考）
          </Text>
          <Text size="xs" c="dimmed" className="mb-3">
            チーム表示には全体共通の管理費・経理追加収支は含まれません。
          </Text>
          <Table verticalSpacing="xs">
            <Table.Tbody>
              {report.orgWideRecurringCosts?.map((recurringCost) => (
                <Table.Tr key={`orgwide-${recurringCost.id}`}>
                  <Table.Td className="text-gray-700">
                    {recurringCost.name}
                    <span className="text-xs text-gray-500 ml-2">
                      {formatRecurringCostNote(recurringCost, {
                        includeItem: true,
                        includeTeam: false,
                      })}
                    </span>
                  </Table.Td>
                  <Table.Td className="text-right w-44">
                    {formatCurrency(recurringCost.price)}
                  </Table.Td>
                </Table.Tr>
              ))}
              {report.orgWideExtraEntries
                ?.flatMap(toExtraEntryAmountLines)
                .map((line) => (
                  <Table.Tr key={`orgwide-${line.key}`}>
                    <Table.Td className="text-gray-700">
                      {line.description}
                      <span className="text-xs text-gray-500 ml-2">
                        {line.note}
                      </span>
                    </Table.Td>
                    <Table.Td className="text-right w-44">
                      {formatCurrency(line.amount)}
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
                <Table.Th className="text-right">粗利</Table.Th>
                <Table.Th className="text-right">管理費</Table.Th>
                <Table.Th className="text-right">経常利益</Table.Th>
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
                  <Table.Td
                    className={`text-right ${amountColor(
                      teamBreakdown.grossProfit,
                    )}`}
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
