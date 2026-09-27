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
import { formatEntryType, isIncomeExtraEntry } from "@/app/utils/extraEntry";
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

// 収支の内訳タブ（Issue #152）。分類別は損益計算書の売上総利益の「案件」行の内訳に
// 統合したためタブを持たない（Issue #164）
export type BreakdownTab = "matter" | "team";
export const DEFAULT_BREAKDOWN_TAB: BreakdownTab = "matter";
// 表示するタブ。チーム別タブはチーム別内訳のあるロール（accounting / admin）のみのため、
// 内訳が無ければ案件別を表示する（選択は親の ProfitLossView が持ち、ここで解決して渡す）
export const resolveBreakdownTab = (
  tab: BreakdownTab,
  hasTeamBreakdown: boolean,
): BreakdownTab =>
  tab === "team" && !hasTeamBreakdown ? DEFAULT_BREAKDOWN_TAB : tab;

// 損益計算書の展開行のキー（Issue #164）。費目は利用者のマスタ値のため種別のプレフィックスを付ける
const GROSS_MATTER_KEY = "gross:matter"; // 売上総利益 > 案件（分類別の粗利）
const GROSS_EXTRA_KEY = "gross:extra"; // 売上総利益 > 経理追加収支（収入）
const ADMIN_EXTRA_KEY = "admin:extra"; // 管理費 > 経理追加収支（支出）
const recurringRowKey = (item: string) => `recurring:${item}`;

// 「売上 X − 費用 Y」の注記の本文（括弧なし）。費用が null（収入エントリの経費なし）なら売上のみ。
// 見出し行・分類行・明細行の注記はすべてこれで組み、書式を揃える
const revenueCostText = (
  revenueLabel: string,
  revenue: number,
  costLabel: string,
  cost: number | null,
) =>
  cost === null
    ? `${revenueLabel} ${formatCurrency(revenue)}`
    : `${revenueLabel} ${formatCurrency(revenue)} − ${costLabel} ${formatCurrency(cost)}`;

// 「（売上 X − 費用 Y）」の注記
const revenueCostNote = (
  revenueLabel: string,
  revenue: number,
  costLabel: string,
  cost: number,
) => `（${revenueCostText(revenueLabel, revenue, costLabel, cost)}）`;

// 損益計算書の内訳の見出し行（子の階層）。onToggle があれば展開できる
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

// 損益計算書の内訳の明細行（孫の階層。元データ / 調整の無い行）
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

// 経理追加収支の明細の補足（分類 / チーム / 日付）
const extraEntryAttributes = (entry: ExtraEntryLine) =>
  `${entry.category} / ${teamLabel(entry.team)} / ${formatDateToJp(entry.entryDate)}`;

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
  if (isIncomeExtraEntry(entry)) {
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
  // 損益計算書の展開状態（案件別収支の展開状態は MatterProfitTable が持つ）。
  // 案件の分類別の粗利は初期表示で開いておく（Issue #164）
  const { expandedRows, toggleRow, expandAll, collapseAll } = useExpandedRows([
    GROSS_MATTER_KEY,
  ]);
  // 経理追加収支は収入を売上総利益、支出を管理費の内訳に表示する（Issue #164。
  // 振り分けは集計側 splitExtraEntries で済んでいるため、ここでは表示するだけ）
  const incomeExtraEntries = report.extraIncome.entries;
  const expenseExtraEntries = report.extraExpense.entries;
  // 展開できる行の有無はここだけで判定し、描画条件と「すべて開く / 閉じる」の対象キーの
  // 両方で同じ値を使う（片方だけ直して一括開閉が効かなくなるのを防ぐ）
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
    report.undated.revenue !== 0 ||
    report.undated.matterCost !== 0 ||
    report.undated.adminCost !== 0;

  // 案件費用・管理費は損益計算書の行で確認できるため、カードは 3 指標のみ（Issue #164）
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

  // 確定後の未処理の変更（Issue #149）がある明細・案件。案件別収支に変更アイコンを付ける
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
      {/* 確定後の案件の変更（差分一覧・反映・見送り。経理担当者・管理者のみ） */}
      <ClosingDiffPanel
        report={report}
        loadingMatterId={loadingMatterId}
        onShowMatter={handleShowMatter}
      />

      {/* サマリーカード */}
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

      {/* 売上総利益（案件 / 経理追加収支（収入））→ 管理費（定期費用 / 経理追加収支（支出））→ 経常利益（Issue #164） */}
      <Paper withBorder radius="md" className="overflow-x-auto mb-6">
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{formatMonthLabel(report.month)} 損益計算書</Table.Th>
              <Table.Th className="text-right w-32">元データ</Table.Th>
              <Table.Th className="text-right w-32">調整</Table.Th>
              <Table.Th className="text-right w-32">実績</Table.Th>
              {/* 列見出しの名前は「操作」（一括開閉のボタンの文言を列名として読み上げないようにする） */}
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
            {/* 売上総利益（粗利）= 案件 + 経理追加収支（収入） */}
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

            {/* 案件（案件別収支の「案件の合計」と一致）→ 分類別の粗利 */}
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

            {/* 経理追加収支（収入）: 請求額 − 経費（収入に紐づく経費） */}
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

            {/* 管理費合計 = 定期費用（費目別。展開で明細）+ 経理追加収支（支出） */}
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

            {/* 経理追加収支（支出）: 経費を管理費へ算入する */}
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

            {/* 経常利益 = 売上総利益 − 管理費合計 */}
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

      {/* 収支の内訳（Issue #152。案件別 / チーム別をタブで切り替える。分類別は Issue #164 で
          損益計算書の「案件」行の内訳に統合した。
          チーム別は accounting / admin のみデータが入る。チーム別内訳の無いロールは
          タブが 1 つになるため、タブを出さずに案件別収支だけを表示する。
          非表示のタブも描画したままにする Mantine v7 の既定（keepMounted）で、
          タブを切り替えても案件別収支の展開状態を保つ） */}
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
          {formatCurrency(report.undated.matterCost)}
          {report.undated.adminCost !== 0 &&
            ` / 管理費: ${formatCurrency(report.undated.adminCost)}`}
          ）。
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
