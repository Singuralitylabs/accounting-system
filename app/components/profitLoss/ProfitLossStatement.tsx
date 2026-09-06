"use client";

import {
  AdjustableAmount,
  AdjustmentTarget,
  ExtraEntryType,
  MatterInfoWithUserNameType,
  PLReportType,
  RecurringCostType,
} from "@/app/types/types";
import { getMatterInfoById } from "@/app/utils/supabase/profitLossReport";
import { formatCurrency, formatMonthLabel } from "@/app/utils/formatter";
import { formatEntryType } from "@/app/utils/extraEntry";
import { formatPaymentCycle } from "@/app/utils/paymentCycle";
import { ORG_WIDE_TEAM_LABEL } from "@/app/utils/constants";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { Fragment, useState } from "react";
import {
  FaChevronDown,
  FaChevronRight,
  FaExclamationTriangle,
} from "react-icons/fa";
import { MatterCardDetail } from "../modal/MatterCardDetail";
import ExtraEntrySection from "./ExtraEntrySection";
import ProfitLossAdjustmentModal from "./ProfitLossAdjustmentModal";
import { notifyError, notifySuccess, toErrorMessage } from "@/app/utils/notify";
import { confirmAction } from "@/app/utils/confirmAction";
import { useDeleteProfitLossAdjustment } from "@/app/hooks/useProfitLossAdjustments";

type Props = {
  report: PLReportType;
  canEditAdjustments: boolean; // 実績額修正の操作を表示するか（accounting / admin）
};

// 「実績額を修正」モーダルに渡す対象の情報
type AdjustmentModalState = {
  target: AdjustmentTarget;
  label: string;
  sourceAmount: number;
  currentActualAmount: number;
  currentReason: string;
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
// 支払サイクルは月払い（既定）以外の場合のみ併記し、月払いの表示を煩雑にしない。
// チームは includeTeam のとき常に表示し、未指定（全体共通）も明示する
// （全体共通（参考）セクションはすでに見出しで示しているため includeTeam=false で呼ぶ）。
const formatRecurringCostNote = (
  recurringCost: RecurringCostType,
  { includeItem, includeTeam }: { includeItem: boolean; includeTeam: boolean },
) => {
  const parts = includeItem ? [recurringCost.item] : [];
  if (recurringCost.payment_cycle !== "monthly") {
    parts.push(formatPaymentCycle(recurringCost.payment_cycle));
  }
  if (includeTeam) {
    parts.push(recurringCost.team ?? ORG_WIDE_TEAM_LABEL);
  }
  return parts.length > 0 ? `（${parts.join(" / ")}）` : "";
};

// 対象種別の日本語表示（「対象行が当月に存在しません」の一覧用）
const targetTypeLabel = {
  business: "売上",
  cost: "案件費用",
  recurring_cost: "管理費",
} as const;

// 損益の符号に応じた文字色（0 は黒字扱い）
const amountColor = (value: number) =>
  value < 0 ? "text-red-600" : "text-green-700";

const ProfitLossStatement = ({ report, canEditAdjustments }: Props) => {
  // 案件費用の品目行・管理費の費目行・売上の分類行の展開状態。
  // 種別が異なっても同名になりうるため、キーには種別のプレフィックスを付ける。
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedMatter, setSelectedMatter] =
    useState<MatterInfoWithUserNameType | null>(null);
  const [isModalOpened, setIsModalOpened] = useState(false);
  const [loadingMatterId, setLoadingMatterId] = useState<number | null>(null);
  const [adjustmentModal, setAdjustmentModal] =
    useState<AdjustmentModalState | null>(null);
  const deleteAdjustmentMutation = useDeleteProfitLossAdjustment();

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

  // 展開可能な見出し行（売上の分類 / 案件費用の品目 / 管理費の費目）に共通で付ける属性。
  // 行全体をクリックできる利便性は残す。キーボード・支援技術向けの操作点は
  // セル内の実ボタン（expandToggle）が担う（<tr> に role="button" を付けると
  // 行としてのセマンティクスが壊れるため、行側には role / tabIndex を付けない）。
  const expandableRowProps = (rowKey: string) => ({
    className: "cursor-pointer",
    onClick: () => toggleRow(rowKey),
  });

  // 見出し行の開閉トグル。native button なので Enter / Space が既定で効く。
  // 行の onClick との二重トグルを避けるため伝播を止める。
  const expandToggle = (rowKey: string, isExpanded: boolean, label: string) => (
    <button
      type="button"
      aria-expanded={isExpanded}
      className="inline-flex items-center gap-2 text-left rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      onClick={(event) => {
        event.stopPropagation();
        toggleRow(rowKey);
      }}
    >
      {isExpanded ? (
        <FaChevronDown size="0.7rem" />
      ) : (
        <FaChevronRight size="0.7rem" />
      )}
      {label}
    </button>
  );

  const handleShowMatter = async (matterId: number) => {
    try {
      setLoadingMatterId(matterId);
      const { matterInfo, error } = await getMatterInfoById(matterId);
      if (error || !matterInfo) {
        notifyError("案件情報の取得に失敗しました。");
        return;
      }
      setSelectedMatter(matterInfo);
      setIsModalOpened(true);
    } finally {
      setLoadingMatterId(null);
    }
  };

  const openAdjustmentModal = (
    target: AdjustmentTarget,
    label: string,
    detail: AdjustableAmount,
  ) => {
    setAdjustmentModal({
      target,
      label,
      sourceAmount: detail.sourceAmount,
      currentActualAmount: detail.actualAmount,
      currentReason: detail.adjustment?.reason ?? "",
    });
  };

  const handleDeleteOrphanedAdjustment = async (
    adjustmentId: number,
    label: string,
  ) => {
    const confirmed = await confirmAction(
      `${label}の損益調整（対象行が当月に存在しません）を削除しますか？`,
    );
    if (!confirmed) return;

    try {
      await deleteAdjustmentMutation.mutateAsync(adjustmentId);
      notifySuccess("損益調整を削除しました。");
    } catch (error) {
      notifyError(toErrorMessage(error, "損益調整の削除に失敗しました。"));
    }
  };

  // 明細行の「元データ / 調整」2列（3列目の「実績」は呼び出し側で強調表示が異なるため個別に描く）
  const sourceAndAdjustmentCells = (detail: AdjustableAmount) => (
    <>
      <Table.Td className="text-right text-gray-500">
        {formatCurrency(detail.sourceAmount)}
      </Table.Td>
      <Table.Td className="text-right text-gray-500">
        {detail.adjustmentAmount === 0
          ? "-"
          : formatCurrency(detail.adjustmentAmount)}
      </Table.Td>
    </>
  );

  // 調整あり・元データ変更検知のバッジ・警告（明細行の「実績」セル内に付ける）
  const adjustmentIndicators = (detail: AdjustableAmount) => (
    <>
      {detail.adjustment && (
        <Badge size="xs" color="blue" variant="light" className="ml-2">
          調整あり
        </Badge>
      )}
      {detail.sourceChanged && (
        <Tooltip label="調整の保存後に元データの金額が変更されています。実績額をご確認ください。">
          <span className="ml-1 inline-flex text-amber-600 align-middle">
            <FaExclamationTriangle size="0.75rem" />
          </span>
        </Tooltip>
      )}
    </>
  );

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
              <Table.Th className="text-right w-32">元データ</Table.Th>
              <Table.Th className="text-right w-32">調整</Table.Th>
              <Table.Th className="text-right w-32">実績</Table.Th>
              <Table.Th className="w-40" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {/* 売上合計 */}
            <Table.Tr className="bg-slate-50">
              <Table.Td className="font-bold">売上合計</Table.Td>
              <Table.Td />
              <Table.Td />
              <Table.Td className="text-right font-bold">
                {formatCurrency(report.revenueTotal)}
              </Table.Td>
              <Table.Td />
            </Table.Tr>
            {report.revenueByCategory.map((breakdown) => {
              const rowKey = `revenue:${breakdown.category}`;
              const isExpanded = expandedRows.has(rowKey);
              return (
                <Fragment key={rowKey}>
                  <Table.Tr {...expandableRowProps(rowKey)}>
                    <Table.Td className="pl-8 text-gray-700">
                      {expandToggle(rowKey, isExpanded, breakdown.category)}
                    </Table.Td>
                    <Table.Td />
                    <Table.Td />
                    <Table.Td className="text-right">
                      {formatCurrency(breakdown.amount)}
                    </Table.Td>
                    <Table.Td />
                  </Table.Tr>
                  {isExpanded &&
                    breakdown.businesses.map((business) => (
                      <Table.Tr
                        key={`${rowKey}-business-${business.businessId}`}
                        className="bg-gray-50"
                      >
                        <Table.Td className="pl-16 text-gray-600">
                          {business.matterTitle}
                        </Table.Td>
                        {sourceAndAdjustmentCells(business)}
                        <Table.Td className="text-right text-gray-600">
                          {formatCurrency(business.actualAmount)}
                          {adjustmentIndicators(business)}
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs" justify="center" wrap="nowrap">
                            <Button
                              size="xs"
                              variant="light"
                              loading={loadingMatterId === business.matterId}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleShowMatter(business.matterId);
                              }}
                            >
                              案件を表示
                            </Button>
                            {canEditAdjustments && (
                              <Button
                                size="xs"
                                variant="subtle"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openAdjustmentModal(
                                    {
                                      targetType: "business",
                                      businessId: business.businessId,
                                    },
                                    `${business.matterTitle}の売上`,
                                    business,
                                  );
                                }}
                              >
                                実績額を修正
                              </Button>
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                </Fragment>
              );
            })}

            {/* 案件費用合計 */}
            <Table.Tr className="bg-slate-50">
              <Table.Td className="font-bold">案件費用合計</Table.Td>
              <Table.Td />
              <Table.Td />
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
                  <Table.Tr {...expandableRowProps(rowKey)}>
                    <Table.Td className="pl-8 text-gray-700">
                      {expandToggle(rowKey, isExpanded, breakdown.item)}
                    </Table.Td>
                    <Table.Td />
                    <Table.Td />
                    <Table.Td className="text-right">
                      {formatCurrency(breakdown.amount)}
                    </Table.Td>
                    <Table.Td />
                  </Table.Tr>
                  {isExpanded && (
                    <>
                      {breakdown.costs.map((cost) => (
                        <Table.Tr
                          key={`${rowKey}-cost-${cost.costId}`}
                          className="bg-gray-50"
                        >
                          <Table.Td className="pl-16 text-gray-600">
                            {cost.matterTitle}
                          </Table.Td>
                          {sourceAndAdjustmentCells(cost)}
                          <Table.Td className="text-right text-gray-600">
                            {formatCurrency(cost.actualAmount)}
                            {adjustmentIndicators(cost)}
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs" justify="center" wrap="nowrap">
                              <Button
                                size="xs"
                                variant="light"
                                loading={loadingMatterId === cost.matterId}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleShowMatter(cost.matterId);
                                }}
                              >
                                案件を表示
                              </Button>
                              {canEditAdjustments && (
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openAdjustmentModal(
                                      {
                                        targetType: "cost",
                                        costId: cost.costId,
                                      },
                                      `${cost.matterTitle}の案件費用（${breakdown.item}）`,
                                      cost,
                                    );
                                  }}
                                >
                                  実績額を修正
                                </Button>
                              )}
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                      {/* 経理追加収支の経費明細行（案件に紐づかないため「案件を表示」ボタンなし。
                          本 Issue の調整対象外のため元データ/調整は表示しない） */}
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
                          <Table.Td />
                          <Table.Td />
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
              <Table.Td />
              <Table.Td />
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
                <Table.Td />
                <Table.Td />
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
              <Table.Td />
              <Table.Td />
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
                  <Table.Tr {...expandableRowProps(rowKey)}>
                    <Table.Td className="pl-8 text-gray-700">
                      {expandToggle(rowKey, isExpanded, breakdown.item)}
                    </Table.Td>
                    <Table.Td />
                    <Table.Td />
                    <Table.Td className="text-right">
                      {formatCurrency(breakdown.amount)}
                    </Table.Td>
                    <Table.Td />
                  </Table.Tr>
                  {isExpanded &&
                    breakdown.details.map((detail) => (
                      <Table.Tr
                        key={`${rowKey}-detail-${detail.recurringCost.id}`}
                        className="bg-gray-50"
                      >
                        <Table.Td className="pl-16 text-gray-600">
                          {detail.recurringCost.name}
                          <span className="text-xs text-gray-500 ml-2">
                            {formatRecurringCostNote(detail.recurringCost, {
                              includeItem: false,
                              includeTeam: true,
                            })}
                          </span>
                        </Table.Td>
                        {sourceAndAdjustmentCells(detail)}
                        <Table.Td className="text-right text-gray-600">
                          {formatCurrency(detail.actualAmount)}
                          {adjustmentIndicators(detail)}
                        </Table.Td>
                        <Table.Td className="text-center">
                          {canEditAdjustments && (
                            <Button
                              size="xs"
                              variant="subtle"
                              onClick={(event) => {
                                event.stopPropagation();
                                openAdjustmentModal(
                                  {
                                    targetType: "recurring_cost",
                                    recurringCostId: detail.recurringCost.id,
                                  },
                                  detail.recurringCost.name,
                                  detail,
                                );
                              }}
                            >
                              実績額を修正
                            </Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                </Fragment>
              );
            })}

            {/* 経常利益 = 粗利合計 − 管理費合計 */}
            <Table.Tr className="bg-slate-100 border-t-2 border-gray-400">
              <Table.Td className="font-bold text-lg">経常利益</Table.Td>
              <Table.Td />
              <Table.Td />
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

      {/* 対象行が当月に存在しない損益調整（案件の日付変更等）。削除を促す */}
      {report.orphanedAdjustments && report.orphanedAdjustments.length > 0 && (
        <Alert
          color="orange"
          title="対象行が当月に存在しない損益調整があります"
          className="mb-6"
        >
          <Text size="sm" className="mb-2">
            案件の日付変更などにより、対象行が当月の集計から外れています。損益には反映されていません。内容を確認して削除してください。
          </Text>
          <Table verticalSpacing="xs">
            <Table.Tbody>
              {report.orphanedAdjustments.map(({ adjustment, targetType }) => (
                <Table.Tr key={`orphan-${adjustment.id}`}>
                  <Table.Td>
                    <Badge
                      size="sm"
                      color="orange"
                      variant="light"
                      className="mr-2"
                    >
                      {targetTypeLabel[targetType]}
                    </Badge>
                    {adjustment.reason}
                    <span className="text-xs text-gray-500 ml-2">
                      （調整額 {formatCurrency(adjustment.adjustment_amount)}）
                    </span>
                  </Table.Td>
                  <Table.Td className="text-right w-32">
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      loading={deleteAdjustmentMutation.isPending}
                      onClick={() =>
                        handleDeleteOrphanedAdjustment(
                          adjustment.id,
                          targetTypeLabel[targetType],
                        )
                      }
                    >
                      削除
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Alert>
      )}

      {/* 経理追加収支: 明細一覧（管理リンクはページ上部の AccountingMasterActions） */}
      <ExtraEntrySection extraEntries={report.extraEntries} />

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
              {report.orgWideRecurringCosts?.map((detail) => (
                <Table.Tr key={`orgwide-${detail.recurringCost.id}`}>
                  <Table.Td className="text-gray-700">
                    {detail.recurringCost.name}
                    <span className="text-xs text-gray-500 ml-2">
                      {formatRecurringCostNote(detail.recurringCost, {
                        includeItem: true,
                        includeTeam: false,
                      })}
                    </span>
                  </Table.Td>
                  <Table.Td className="text-right w-44">
                    {formatCurrency(detail.actualAmount)}
                    {adjustmentIndicators(detail)}
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
        <MatterCardDetail
          variant="readonly"
          matterInfo={selectedMatter}
          opened={isModalOpened}
          setOpened={setIsModalOpened}
        />
      )}

      {/* 実績額修正モーダル（accounting / admin のみ開ける） */}
      {adjustmentModal && (
        <ProfitLossAdjustmentModal
          opened
          onClose={() => setAdjustmentModal(null)}
          target={adjustmentModal.target}
          targetMonth={report.month}
          label={adjustmentModal.label}
          sourceAmount={adjustmentModal.sourceAmount}
          currentActualAmount={adjustmentModal.currentActualAmount}
          currentReason={adjustmentModal.currentReason}
        />
      )}
    </div>
  );
};

export default ProfitLossStatement;
