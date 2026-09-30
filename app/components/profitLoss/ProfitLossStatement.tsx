"use client";

import {
  AdjustableAmount,
  AdjustmentTarget,
  ExtraEntryLine,
  LabelTarget,
  MatterInfoWithUserNameType,
  PLReportType,
} from "@/app/types/types";
import { getMatterInfoById } from "@/app/utils/supabase/profitLossReport";
import {
  formatCurrency,
  formatDateToJp,
  formatMonthLabel,
} from "@/app/utils/formatter";
import { teamLabel } from "@/app/utils/constants";
import {
  Alert,
  Badge,
  Button,
  Paper,
  SimpleGrid,
  Table,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { Fragment, ReactNode, useState } from "react";
import { MatterCardDetail } from "../modal/MatterCardDetail";
import ProfitLossAdjustmentModal from "./ProfitLossAdjustmentModal";
import ProfitLossLabelModal from "./ProfitLossLabelModal";
import MatterProfitTable from "./MatterProfitTable";
import TeamProfitTable from "./TeamProfitTable";
import ClosingDiffPanel from "./ClosingDiffPanel";
import {
  AdjustmentButton,
  AdjustmentIndicators,
  EditableTitle,
  ExpandAllButtons,
  ExpandToggle,
  INDENT,
  amountColor,
  expandableRowProps,
  formatRecurringCostNote,
  useExpandedRows,
} from "./plTableParts";
import { notifyError, notifySuccess, toErrorMessage } from "@/app/utils/notify";
import { confirmAction } from "@/app/utils/confirmAction";
import { useDeleteProfitLossAdjustment } from "@/app/hooks/useProfitLossAdjustments";
import { CLOSED_MONTH_LOCK_MESSAGE } from "@/app/utils/profitLossClosing";

// Breakdown tabs. The by-category view is merged into the gross-profit "matter" row, so it has no tab.
export type BreakdownTab = "matter" | "team";
export const DEFAULT_BREAKDOWN_TAB: BreakdownTab = "matter";
// Displayed tab; the team tab exists only for roles with a team breakdown (accounting/admin), otherwise show per-matter (selection lives in the parent ProfitLossView).
export const resolveBreakdownTab = (
  tab: BreakdownTab,
  hasTeamBreakdown: boolean,
): BreakdownTab =>
  tab === "team" && !hasTeamBreakdown ? DEFAULT_BREAKDOWN_TAB : tab;

// Expandable row keys. Item names are user master values, hence the type prefix.
const GROSS_MATTER_KEY = "gross:matter";
const GROSS_EXTRA_KEY = "gross:extra";
const ADMIN_EXTRA_KEY = "admin:extra";
const recurringRowKey = (item: string) => `recurring:${item}`;

// Body of the "revenue X - cost Y" note (no parentheses); null cost (income entry without expense) shows revenue only. Shared by heading, category and line rows for consistent format.
const revenueCostText = (
  revenueLabel: string,
  revenue: number,
  costLabel: string,
  cost: number | null,
) =>
  cost === null
    ? `${revenueLabel} ${formatCurrency(revenue)}`
    : `${revenueLabel} ${formatCurrency(revenue)} − ${costLabel} ${formatCurrency(cost)}`;

const revenueCostNote = (
  revenueLabel: string,
  revenue: number,
  costLabel: string,
  cost: number,
) => `（${revenueCostText(revenueLabel, revenue, costLabel, cost)}）`;

const BreakdownHeadingRow = ({
  label,
  note,
  amount,
  colorBySign = false,
  isExpanded = false,
  onToggle,
}: {
  label: ReactNode;
  note?: string;
  amount: number;
  colorBySign?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
}) => (
  <Table.Tr {...(onToggle ? expandableRowProps(onToggle) : {})}>
    <Table.Td className="text-gray-700" style={INDENT.child}>
      {onToggle ? (
        <ExpandToggle isExpanded={isExpanded} onToggle={onToggle}>
          {label}
        </ExpandToggle>
      ) : (
        label
      )}
      {note && <span className="text-xs text-gray-500 ml-2">{note}</span>}
    </Table.Td>
    <Table.Td />
    <Table.Td />
    <Table.Td
      className={`text-right ${colorBySign ? amountColor(amount) : ""}`}
    >
      {formatCurrency(amount)}
    </Table.Td>
    <Table.Td />
  </Table.Tr>
);

const BreakdownDetailRow = ({
  label,
  note,
  amount,
  colorBySign = false,
}: {
  label: string;
  note: string;
  amount: number;
  colorBySign?: boolean;
}) => (
  <Table.Tr className="bg-gray-50">
    <Table.Td className="text-gray-600" style={INDENT.detail}>
      {label}
      <span className="text-xs text-gray-500 ml-2">{note}</span>
    </Table.Td>
    <Table.Td />
    <Table.Td />
    <Table.Td
      className={`text-right ${colorBySign ? amountColor(amount) : "text-gray-600"}`}
    >
      {formatCurrency(amount)}
    </Table.Td>
    <Table.Td />
  </Table.Tr>
);

const extraEntryAttributes = (entry: ExtraEntryLine) =>
  `${entry.category} / ${teamLabel(entry.team)} / ${formatDateToJp(entry.entryDate)}`;

type Props = {
  report: PLReportType;
  canEditAdjustments: boolean;
  canEditLabels: boolean;
  // Selected breakdown tab; owned by the parent because this component is recreated on month change.
  breakdownTab?: BreakdownTab;
  onBreakdownTabChange?: (tab: BreakdownTab) => void;
};

type LabelModalState = {
  target: LabelTarget;
  originalTitle: string;
  currentTitle: string | null;
};

type AdjustmentModalState = {
  target: AdjustmentTarget;
  label: string;
  sourceAmount: number;
  currentActualAmount: number;
  currentReason: string;
};

const targetTypeLabel = {
  business: "売上",
  cost: "案件費用",
  recurring_cost: "管理費",
} as const;

const ProfitLossStatement = ({
  report,
  canEditAdjustments,
  canEditLabels,
  breakdownTab = DEFAULT_BREAKDOWN_TAB,
  onBreakdownTabChange = () => {},
}: Props) => {
  // Expansion state of the statement (per-matter expansion lives in MatterProfitTable). The category gross-profit breakdown starts open.
  const { expandedRows, toggleRow, expandAll, collapseAll } = useExpandedRows([
    GROSS_MATTER_KEY,
  ]);
  // Income entries show under gross profit, expense entries under admin cost; splitting is done in splitExtraEntries, so this only displays.
  const incomeExtraEntries = report.extraIncome.entries;
  const expenseExtraEntries = report.extraExpense.entries;
  // Single source for whether rows are expandable, used for both rendering and the bulk toggle keys (so fixing one side cannot break bulk toggle).
  const canExpandMatter = report.categoryBreakdown.length > 0;
  const hasIncomeExtra = incomeExtraEntries.length > 0;
  const hasExpenseExtra = expenseExtraEntries.length > 0;
  const expandableKeys = [
    ...(canExpandMatter ? [GROSS_MATTER_KEY] : []),
    ...(hasIncomeExtra ? [GROSS_EXTRA_KEY] : []),
    ...report.recurringCostByItem.map((breakdown) =>
      recurringRowKey(breakdown.item),
    ),
    ...(hasExpenseExtra ? [ADMIN_EXTRA_KEY] : []),
  ];
  const [selectedMatter, setSelectedMatter] =
    useState<MatterInfoWithUserNameType | null>(null);
  const [isModalOpened, setIsModalOpened] = useState(false);
  const [loadingMatterId, setLoadingMatterId] = useState<number | null>(null);
  const [adjustmentModal, setAdjustmentModal] =
    useState<AdjustmentModalState | null>(null);
  const [labelModal, setLabelModal] = useState<LabelModalState | null>(null);
  // Ids of adjustments being deleted (rows absent from the month); tracked per row since mutation.isPending alone spins every button. A Set so finishing one deletion does not stop another row's spinner.
  const [deletingAdjustmentIds, setDeletingAdjustmentIds] = useState<
    Set<number>
  >(new Set());
  const deleteAdjustmentMutation = useDeleteProfitLossAdjustment();

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
      currentReason: detail.adjustmentReason ?? "",
    });
  };

  const openLabelModal = (
    target: LabelTarget,
    originalTitle: string,
    currentTitle: string | null,
  ) => {
    setLabelModal({ target, originalTitle, currentTitle });
  };

  const handleDeleteOrphanedAdjustment = async (
    adjustmentId: number,
    label: string,
  ) => {
    const confirmed = await confirmAction(
      `${label}の損益調整（対象行が当月に存在しません）を削除しますか？`,
    );
    if (!confirmed) return;

    setDeletingAdjustmentIds((prev) => new Set(prev).add(adjustmentId));
    try {
      await deleteAdjustmentMutation.mutateAsync(adjustmentId);
      notifySuccess("損益調整を削除しました。");
    } catch (error) {
      notifyError(toErrorMessage(error, "損益調整の削除に失敗しました。"));
    } finally {
      setDeletingAdjustmentIds((prev) => {
        const next = new Set(prev);
        next.delete(adjustmentId);
        return next;
      });
    }
  };

  // Closed months cannot be adjusted (turn off the closed check first).
  const isClosed = !!report.closing;

  const hasUndated =
    report.undated.revenue !== 0 ||
    report.undated.matterCost !== 0 ||
    report.undated.adminCost !== 0;

  const summaryCards = [
    { label: "売上", value: report.revenueTotal, color: "text-green-700" },
    {
      label: "粗利",
      value: report.grossProfitTotal,
      color: amountColor(report.grossProfitTotal),
    },
    {
      label: "経常利益",
      value: report.ordinaryProfit,
      color: amountColor(report.ordinaryProfit),
    },
  ];

  const pendingDiffs = report.closingDiffs?.pending ?? [];
  const changedKeys = new Set(pendingDiffs.map((diff) => diff.key));
  const changedMatterIds = new Set(pendingDiffs.map((diff) => diff.matterId));

  const matterProfitTable = (
    <MatterProfitTable
      matters={report.matterBreakdowns}
      totals={report.matterTotals}
      canEditAdjustments={canEditAdjustments}
      isClosed={isClosed}
      changedKeys={changedKeys}
      changedMatterIds={changedMatterIds}
      loadingMatterId={loadingMatterId}
      onShowMatter={handleShowMatter}
      onEditAdjustment={openAdjustmentModal}
      canEditLabels={canEditLabels}
      onEditTitle={openLabelModal}
    />
  );

  return (
    <div>
      <ClosingDiffPanel
        report={report}
        loadingMatterId={loadingMatterId}
        onShowMatter={handleShowMatter}
      />

      <SimpleGrid cols={{ base: 1, xs: 3 }} className="mb-6">
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

      <Paper withBorder radius="md" className="overflow-x-auto mb-6">
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{formatMonthLabel(report.month)} 損益計算書</Table.Th>
              <Table.Th className="text-right w-32">元データ</Table.Th>
              <Table.Th className="text-right w-32">調整</Table.Th>
              <Table.Th className="text-right w-32">実績</Table.Th>
              {/* Column name is "操作" so the bulk-toggle button text is not read as the column name. */}
              <Table.Th className="w-36" aria-label="操作">
                <ExpandAllButtons
                  label="損益計算書の内訳"
                  disabled={expandableKeys.length === 0}
                  onExpandAll={() => expandAll(expandableKeys)}
                  onCollapseAll={() => collapseAll(expandableKeys)}
                />
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr className="bg-slate-50">
              <Table.Td className="font-bold">
                売上総利益（粗利）
                <span className="text-xs text-gray-500 font-normal ml-2">
                  {revenueCostNote(
                    "売上",
                    report.revenueTotal,
                    "案件費用",
                    report.matterCostTotal,
                  )}
                </span>
              </Table.Td>
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

            <BreakdownHeadingRow
              label="案件"
              note={revenueCostNote(
                "売上",
                report.matterTotals.revenue,
                "費用",
                report.matterTotals.cost,
              )}
              amount={report.matterTotals.grossProfit}
              colorBySign
              isExpanded={expandedRows.has(GROSS_MATTER_KEY)}
              onToggle={
                canExpandMatter ? () => toggleRow(GROSS_MATTER_KEY) : undefined
              }
            />
            {canExpandMatter &&
              expandedRows.has(GROSS_MATTER_KEY) &&
              report.categoryBreakdown.map((row) => (
                <BreakdownDetailRow
                  key={`category-${row.category}`}
                  label={row.category}
                  note={revenueCostNote("売上", row.revenue, "費用", row.cost)}
                  amount={row.grossProfit}
                  colorBySign
                />
              ))}

            {hasIncomeExtra && (
              <>
                <BreakdownHeadingRow
                  label="経理追加収支"
                  note={revenueCostNote(
                    "請求",
                    report.extraIncome.revenue,
                    "経費",
                    report.extraIncome.cost,
                  )}
                  amount={report.extraIncome.grossProfit}
                  colorBySign
                  isExpanded={expandedRows.has(GROSS_EXTRA_KEY)}
                  onToggle={() => toggleRow(GROSS_EXTRA_KEY)}
                />
                {expandedRows.has(GROSS_EXTRA_KEY) &&
                  incomeExtraEntries.map((entry) => (
                    <BreakdownDetailRow
                      key={`extra-income-${entry.extraEntryId}`}
                      label={entry.description}
                      note={`（${extraEntryAttributes(entry)} / ${revenueCostText(
                        "請求",
                        entry.billingAmount ?? 0,
                        "経費",
                        entry.expenseAmount,
                      )}）`}
                      amount={entry.grossProfit}
                      colorBySign
                    />
                  ))}
              </>
            )}

            <Table.Tr className="bg-slate-50">
              <Table.Td className="font-bold">
                管理費合計
                {hasExpenseExtra && (
                  <span className="text-xs text-gray-500 font-normal ml-2">
                    （定期費用 {formatCurrency(report.recurringCostTotal)} ＋
                    経理追加収支（支出）{" "}
                    {formatCurrency(report.extraExpense.total)}）
                  </span>
                )}
              </Table.Td>
              <Table.Td />
              <Table.Td />
              <Table.Td className="text-right font-bold">
                {formatCurrency(report.adminCostTotal)}
              </Table.Td>
              <Table.Td />
            </Table.Tr>
            {report.recurringCostByItem.map((breakdown) => {
              const rowKey = recurringRowKey(breakdown.item);
              const isExpanded = expandedRows.has(rowKey);
              return (
                <Fragment key={rowKey}>
                  <BreakdownHeadingRow
                    label={breakdown.item}
                    amount={breakdown.amount}
                    isExpanded={isExpanded}
                    onToggle={() => toggleRow(rowKey)}
                  />
                  {isExpanded &&
                    breakdown.details.map((detail) => (
                      <Table.Tr
                        key={`${rowKey}-detail-${detail.recurringCostId}`}
                        className="bg-gray-50"
                      >
                        <Table.Td
                          className="text-gray-600"
                          style={INDENT.detail}
                        >
                          <EditableTitle
                            title={detail}
                            originalTitle={detail.name}
                            onEdit={
                              canEditLabels
                                ? () =>
                                    openLabelModal(
                                      {
                                        targetType: "recurring_cost",
                                        recurringCostId: detail.recurringCostId,
                                      },
                                      detail.name,
                                      detail.isCustomTitle
                                        ? detail.displayTitle
                                        : null,
                                    )
                                : undefined
                            }
                          />
                          <span className="text-xs text-gray-500 ml-2">
                            {formatRecurringCostNote(detail, {
                              includeItem: false,
                              includeTeam: true,
                            })}
                          </span>
                        </Table.Td>
                        <Table.Td className="text-right text-gray-500">
                          {formatCurrency(detail.sourceAmount)}
                        </Table.Td>
                        <Table.Td className="text-right text-gray-500">
                          {detail.adjustmentAmount === 0
                            ? "-"
                            : formatCurrency(detail.adjustmentAmount)}
                        </Table.Td>
                        <Table.Td className="text-right text-gray-600">
                          {formatCurrency(detail.actualAmount)}
                          <AdjustmentIndicators detail={detail} />
                        </Table.Td>
                        <Table.Td className="text-center">
                          {canEditAdjustments && (
                            <AdjustmentButton
                              isClosed={isClosed}
                              onClick={() =>
                                openAdjustmentModal(
                                  {
                                    targetType: "recurring_cost",
                                    recurringCostId: detail.recurringCostId,
                                  },
                                  detail.displayTitle,
                                  detail,
                                )
                              }
                            />
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                </Fragment>
              );
            })}

            {hasExpenseExtra && (
              <>
                <BreakdownHeadingRow
                  label="経理追加収支（支出）"
                  amount={report.extraExpense.total}
                  isExpanded={expandedRows.has(ADMIN_EXTRA_KEY)}
                  onToggle={() => toggleRow(ADMIN_EXTRA_KEY)}
                />
                {expandedRows.has(ADMIN_EXTRA_KEY) &&
                  expenseExtraEntries.map((entry) => (
                    <BreakdownDetailRow
                      key={`extra-expense-${entry.extraEntryId}`}
                      label={entry.description}
                      note={`（${extraEntryAttributes(entry)}）`}
                      amount={entry.expenseAmount ?? 0}
                    />
                  ))}
              </>
            )}

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

      {/* Keep the per-matter expansion state when switching tabs. */}
      {report.byTeam ? (
        <Tabs
          value={breakdownTab}
          onChange={(value) =>
            onBreakdownTabChange(
              (value as BreakdownTab | null) ?? DEFAULT_BREAKDOWN_TAB,
            )
          }
          className="mb-6"
        >
          <Tabs.List>
            <Tabs.Tab value="matter">案件別</Tabs.Tab>
            <Tabs.Tab value="team">チーム別</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="matter" className="pt-4">
            {matterProfitTable}
          </Tabs.Panel>

          <Tabs.Panel value="team" className="pt-4">
            <TeamProfitTable byTeam={report.byTeam} />
          </Tabs.Panel>
        </Tabs>
      ) : (
        <div className="mb-6">{matterProfitTable}</div>
      )}

      {report.orphanedAdjustments && report.orphanedAdjustments.length > 0 && (
        <Alert
          color="orange"
          title="対象行が当月に存在しない損益調整があります"
          className="mb-6"
        >
          <Text size="sm" className="mb-2">
            {isClosed
              ? "案件開始日の変更や下書きへの差し戻しなどにより、対象行が当月の集計から外れている損益調整があります。確定値への算入の有無は各行に表示しています。調整を削除するには「確定済み」をオフにしてください。"
              : "案件開始日の変更や下書きへの差し戻しなどにより、対象行が当月の集計から外れています。損益には反映されていません。内容を確認して削除してください。"}
          </Text>
          <Table verticalSpacing="xs">
            <Table.Tbody>
              {report.orphanedAdjustments.map(
                ({ adjustment, targetType, label, includedInClosing }) => (
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
                      {label}
                      {includedInClosing !== undefined && (
                        <Badge
                          size="xs"
                          variant="outline"
                          color={includedInClosing ? "teal" : "gray"}
                          className="ml-2"
                        >
                          {includedInClosing
                            ? "確定値に算入済み"
                            : "確定値にも含まれていません"}
                        </Badge>
                      )}
                      <span className="text-xs text-gray-500 ml-2">
                        （{adjustment.reason} / 調整額{" "}
                        {formatCurrency(adjustment.adjustment_amount)}）
                      </span>
                    </Table.Td>
                    <Table.Td className="text-right w-32">
                      <Tooltip
                        label={CLOSED_MONTH_LOCK_MESSAGE}
                        disabled={!isClosed}
                        multiline
                        w={260}
                      >
                        <span>
                          <Button
                            size="xs"
                            color="red"
                            variant="light"
                            disabled={isClosed}
                            loading={deletingAdjustmentIds.has(adjustment.id)}
                            onClick={() =>
                              handleDeleteOrphanedAdjustment(
                                adjustment.id,
                                label,
                              )
                            }
                          >
                            削除
                          </Button>
                        </span>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ),
              )}
            </Table.Tbody>
          </Table>
        </Alert>
      )}

      {hasUndated && (
        <Alert color="yellow" title="月未確定のデータがあります">
          案件開始日・経理追加収支の日付が未入力のため、月次集計に含まれていないデータがあります（売上:
          {formatCurrency(report.undated.revenue)} / 案件費用:
          {formatCurrency(report.undated.matterCost)}
          {report.undated.adminCost !== 0 &&
            ` / 管理費: ${formatCurrency(report.undated.adminCost)}`}
          ）。
        </Alert>
      )}

      {selectedMatter && (
        <MatterCardDetail
          variant="readonly"
          matterInfo={selectedMatter}
          opened={isModalOpened}
          setOpened={setIsModalOpened}
        />
      )}

      {labelModal && (
        <ProfitLossLabelModal
          opened
          onClose={() => setLabelModal(null)}
          target={labelModal.target}
          originalTitle={labelModal.originalTitle}
          currentTitle={labelModal.currentTitle}
        />
      )}

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
