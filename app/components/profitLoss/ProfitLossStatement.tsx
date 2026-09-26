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
import { formatCurrency, formatMonthLabel } from "@/app/utils/formatter";
import { formatEntryType } from "@/app/utils/extraEntry";
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
import { Fragment, useState } from "react";
import { MatterCardDetail } from "../modal/MatterCardDetail";
import ExtraEntrySection from "./ExtraEntrySection";
import ProfitLossAdjustmentModal from "./ProfitLossAdjustmentModal";
import ProfitLossLabelModal from "./ProfitLossLabelModal";
import MatterProfitTable from "./MatterProfitTable";
import CategoryProfitTable from "./CategoryProfitTable";
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

// 収支の内訳タブ（Issue #152）
export type BreakdownTab = "matter" | "category" | "team";
export const DEFAULT_BREAKDOWN_TAB: BreakdownTab = "matter";

// 管理費の費目行の展開キー
const recurringRowKey = (item: string) => `recurring:${item}`;

type Props = {
  report: PLReportType;
  canEditAdjustments: boolean; // 実績額修正の操作を表示するか（accounting / admin）
  canEditLabels: boolean; // 表示タイトルの変更操作を表示するか（accounting / admin）
  // 選択中の内訳タブ。月を切り替えるとこのコンポーネントは作り直されるため、
  // 選択は親（ProfitLossView）が持つ
  breakdownTab?: BreakdownTab;
  onBreakdownTabChange?: (tab: BreakdownTab) => void;
};

// 「タイトルを変更」モーダルに渡す対象の情報
type LabelModalState = {
  target: LabelTarget;
  originalTitle: string;
  currentTitle: string | null;
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
  entry: ExtraEntryLine,
): ExtraEntryAmountLine[] => {
  const lines: ExtraEntryAmountLine[] = [];
  if (entry.entryType === "income") {
    lines.push({
      key: `extra-${entry.extraEntryId}-billing`,
      description: entry.description,
      note: `（${formatEntryType(entry.entryType)}・請求額 / ${entry.category}）`,
      amount: entry.billingAmount ?? 0,
    });
  }
  if (entry.expenseAmount !== null) {
    lines.push({
      key: `extra-${entry.extraEntryId}-expense`,
      description: entry.description,
      note: `（${formatEntryType(entry.entryType)}・経費 / ${entry.category}）`,
      amount: entry.expenseAmount,
    });
  }
  return lines;
};

// 対象種別の日本語表示（「対象行が当月に存在しません」の一覧用）
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
  // 管理費の費目行の展開状態（案件別収支の展開状態は MatterProfitTable が持つ）
  const { expandedRows, toggleRow, expandAll, collapseAll } = useExpandedRows();
  // チーム別タブはチーム別内訳のあるロール（accounting / admin）のみ。無ければ案件別を表示する
  const activeBreakdownTab: BreakdownTab =
    breakdownTab === "team" && !report.byTeam
      ? DEFAULT_BREAKDOWN_TAB
      : breakdownTab;
  const [selectedMatter, setSelectedMatter] =
    useState<MatterInfoWithUserNameType | null>(null);
  const [isModalOpened, setIsModalOpened] = useState(false);
  const [loadingMatterId, setLoadingMatterId] = useState<number | null>(null);
  const [adjustmentModal, setAdjustmentModal] =
    useState<AdjustmentModalState | null>(null);
  const [labelModal, setLabelModal] = useState<LabelModalState | null>(null);
  // 削除中の対象行が当月に存在しない調整の id 集合（deleteAdjustmentMutation.isPending
  // だけで判定すると全行のボタンが連動してスピナーになるため、行ごとに個別管理する。
  // Set にしているのは、複数行を続けて削除したときに片方の完了で他方のスピナーが
  // 消えてしまわないようにするため）
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

  // 確定済みの月（Issue #148）は損益調整を編集できない（確定済みチェックをオフにしてから編集する）
  const isClosed = !!report.closing;

  const hasUndated =
    report.undated.revenue !== 0 || report.undated.matterCost !== 0;

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

  // 確定後の未処理の変更（Issue #149）がある明細・案件。案件別収支に変更アイコンを付ける
  const pendingDiffs = report.closingDiffs?.pending ?? [];
  const changedKeys = new Set(pendingDiffs.map((diff) => diff.key));
  const changedMatterIds = new Set(pendingDiffs.map((diff) => diff.matterId));

  return (
    <div>
      {/* 確定後の案件の変更（差分一覧・反映・見送り。経理担当者・管理者のみ） */}
      <ClosingDiffPanel
        report={report}
        loadingMatterId={loadingMatterId}
        onShowMatter={handleShowMatter}
      />

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

      {/* 粗利 → 管理費 → 経常利益 */}
      <Paper withBorder radius="md" className="overflow-x-auto mb-6">
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{formatMonthLabel(report.month)} 損益計算書</Table.Th>
              <Table.Th className="text-right w-32">元データ</Table.Th>
              <Table.Th className="text-right w-32">調整</Table.Th>
              <Table.Th className="text-right w-32">実績</Table.Th>
              <Table.Th className="w-36">
                <ExpandAllButtons
                  label="管理費の内訳"
                  disabled={report.recurringCostByItem.length === 0}
                  onExpandAll={() =>
                    expandAll(
                      report.recurringCostByItem.map((breakdown) =>
                        recurringRowKey(breakdown.item),
                      ),
                    )
                  }
                  onCollapseAll={collapseAll}
                />
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {/* 売上総利益（粗利）= 売上合計 − 案件費用合計（案件と経理追加収支） */}
            <Table.Tr className="bg-slate-50">
              <Table.Td className="font-bold">
                売上総利益（粗利）
                <span className="text-xs text-gray-500 font-normal ml-2">
                  （売上 {formatCurrency(report.revenueTotal)} − 案件費用{" "}
                  {formatCurrency(report.matterCostTotal)}）
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
              const rowKey = recurringRowKey(breakdown.item);
              const isExpanded = expandedRows.has(rowKey);
              return (
                <Fragment key={rowKey}>
                  <Table.Tr {...expandableRowProps(() => toggleRow(rowKey))}>
                    <Table.Td className="text-gray-700" style={INDENT.child}>
                      <ExpandToggle
                        isExpanded={isExpanded}
                        onToggle={() => toggleRow(rowKey)}
                      >
                        {breakdown.item}
                      </ExpandToggle>
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

      {/* 収支の内訳（Issue #152。案件別 / 分類別 / チーム別をタブで切り替える。
          チーム別は accounting / admin のみデータが入る） */}
      <Tabs
        value={activeBreakdownTab}
        onChange={(value) =>
          onBreakdownTabChange(
            (value as BreakdownTab | null) ?? DEFAULT_BREAKDOWN_TAB,
          )
        }
        keepMounted
        className="mb-6"
      >
        <Tabs.List>
          <Tabs.Tab value="matter">案件別</Tabs.Tab>
          <Tabs.Tab value="category">分類別</Tabs.Tab>
          {report.byTeam && <Tabs.Tab value="team">チーム別</Tabs.Tab>}
        </Tabs.List>

        <Tabs.Panel value="matter" className="pt-4">
          <MatterProfitTable
            matters={report.matterBreakdowns}
            hasExtraEntries={report.extraEntries.length > 0}
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
        </Tabs.Panel>

        <Tabs.Panel value="category" className="pt-4">
          <CategoryProfitTable
            breakdown={report.categoryBreakdown}
            revenueTotal={report.revenueTotal}
            matterCostTotal={report.matterCostTotal}
            grossProfitTotal={report.grossProfitTotal}
          />
        </Tabs.Panel>

        {report.byTeam && (
          <Tabs.Panel value="team" className="pt-4">
            {report.byTeam.length === 0 ? (
              <Text size="sm" c="dimmed">
                この月に計上される収支はありません。
              </Text>
            ) : (
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
          </Tabs.Panel>
        )}
      </Tabs>

      {/* 対象行が当月に存在しない損益調整（案件開始日の変更等）。削除を促す */}
      {report.orphanedAdjustments && report.orphanedAdjustments.length > 0 && (
        <Alert
          color="orange"
          title="対象行が当月に存在しない損益調整があります"
          className="mb-6"
        >
          <Text size="sm" className="mb-2">
            {isClosed
              ? // 判定はライブの状態で行う。確定値に算入済みかは行ごとに示す
                "案件開始日の変更や下書きへの差し戻しなどにより、対象行が当月の集計から外れている損益調整があります。確定値への算入の有無は各行に表示しています。調整を削除するには「確定済み」をオフにしてください。"
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
                <Table.Tr key={`orgwide-${detail.recurringCostId}`}>
                  <Table.Td className="text-gray-700">
                    <EditableTitle title={detail} originalTitle={detail.name} />
                    <span className="text-xs text-gray-500 ml-2">
                      {formatRecurringCostNote(detail, {
                        includeItem: true,
                        includeTeam: false,
                      })}
                    </span>
                  </Table.Td>
                  <Table.Td className="text-right w-44">
                    {formatCurrency(detail.actualAmount)}
                    <AdjustmentIndicators detail={detail} />
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

      {/* 月未確定 */}
      {hasUndated && (
        <Alert color="yellow" title="月未確定のデータがあります">
          案件開始日・経理追加収支の日付が未入力のため、月次集計に含まれていないデータがあります（売上:
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

      {/* タイトル変更モーダル（accounting / admin のみ開ける） */}
      {labelModal && (
        <ProfitLossLabelModal
          opened
          onClose={() => setLabelModal(null)}
          target={labelModal.target}
          originalTitle={labelModal.originalTitle}
          currentTitle={labelModal.currentTitle}
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
