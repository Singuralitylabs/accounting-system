"use client";

import { ClosingDiff, ClosingDiffKey, PLReportType } from "@/app/types/types";
import {
  formatCurrency,
  formatDateTimeToJp,
  formatMonthLabel,
} from "@/app/utils/formatter";
import {
  DiffImpact,
  computeDiffImpact,
  diffKindLabel,
  toDiffSelection,
} from "@/app/utils/profitLossDiff";
import { confirmAction } from "@/app/utils/confirmAction";
import { notifyError, notifySuccess, toErrorMessage } from "@/app/utils/notify";
import {
  useApplyClosingDiffs,
  useDismissClosingDiffs,
  useUndoClosingDismissals,
} from "@/app/hooks/useProfitLossClosing";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  SimpleGrid,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { useEffect, useState } from "react";
import {
  FaChevronDown,
  FaChevronRight,
  FaExclamationTriangle,
} from "react-icons/fa";
import { amountColor } from "./plTableParts";

type Props = {
  report: PLReportType;
  loadingMatterId: number | null;
  onShowMatter: (matterId: number) => void;
};

const toKey = (diff: ClosingDiff): ClosingDiffKey => ({
  sourceType: diff.sourceType,
  sourceId: diff.sourceId,
});

// 差分の補足（他の月との移動・削除の理由）
const diffNote = (diff: ClosingDiff): string | null => {
  if (diff.kind === "added" && diff.movedMonth) {
    return `${formatMonthLabel(diff.movedMonth)}から移動`;
  }
  if (diff.kind === "removed") {
    switch (diff.removedReason) {
      case "moved":
        return diff.movedMonth
          ? `${formatMonthLabel(diff.movedMonth)}へ移動`
          : null;
      case "undated":
        return "案件開始日が未入力になった";
      case "draft":
        return "下書きに戻された";
      case "deleted":
        return "削除された";
      default:
        return null;
    }
  }
  return null;
};

const stateText = (state: ClosingDiff["before"]) =>
  state ? formatCurrency(state.actualAmount) : "-";

// 影響額（確定値 → 反映後）の表示
const ImpactGrid = ({ impact }: { impact: DiffImpact }) => {
  const items = [
    { label: "売上", value: impact.revenue },
    { label: "案件費用", value: impact.matterCost },
    { label: "粗利", value: impact.grossProfit, colored: true },
    { label: "経常利益", value: impact.ordinaryProfit, colored: true },
  ];
  return (
    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="xs">
      {items.map(({ label, value, colored }) => (
        <Paper key={label} withBorder p="xs" radius="sm">
          <Text size="xs" c="dimmed">
            {label}（確定値 → 反映後）
          </Text>
          <Text size="sm">
            {formatCurrency(value.before)} →{" "}
            <span
              className={`font-bold ${colored ? amountColor(value.after) : ""}`}
            >
              {formatCurrency(value.after)}
            </span>
          </Text>
        </Paper>
      ))}
    </SimpleGrid>
  );
};

const impactText = (impact: DiffImpact) =>
  [
    `売上: ${formatCurrency(impact.revenue.before)} → ${formatCurrency(impact.revenue.after)}`,
    `案件費用: ${formatCurrency(impact.matterCost.before)} → ${formatCurrency(impact.matterCost.after)}`,
    `粗利: ${formatCurrency(impact.grossProfit.before)} → ${formatCurrency(impact.grossProfit.after)}`,
    `経常利益: ${formatCurrency(impact.ordinaryProfit.before)} → ${formatCurrency(impact.ordinaryProfit.after)}`,
  ].join("\n");

// 確定後の案件の変更（差分）の一覧と、明細単位の反映・見送り（Issue #149）。
// 経理担当者・管理者のみ表示する（report.closingDiffs はそのロールにのみ入る）
const ClosingDiffPanel = ({ report, loadingMatterId, onShowMatter }: Props) => {
  const diffs = report.closingDiffs;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedDismissed, setSelectedDismissed] = useState<Set<string>>(
    new Set(),
  );
  const [showDismissed, setShowDismissed] = useState(false);
  const applyMutation = useApplyClosingDiffs();
  const dismissMutation = useDismissClosingDiffs();
  const undoMutation = useUndoClosingDismissals();
  const isPending =
    applyMutation.isPending ||
    dismissMutation.isPending ||
    undoMutation.isPending;

  // 再取得で差分が変わったら、無くなった差分の選択を外す
  useEffect(() => {
    const pendingKeys = new Set(diffs?.pending.map((diff) => diff.key));
    const dismissedKeys = new Set(diffs?.dismissed.map((diff) => diff.key));
    setSelected(
      (prev) => new Set(Array.from(prev).filter((key) => pendingKeys.has(key))),
    );
    setSelectedDismissed(
      (prev) =>
        new Set(Array.from(prev).filter((key) => dismissedKeys.has(key))),
    );
  }, [diffs]);

  if (!diffs || (diffs.pending.length === 0 && diffs.dismissed.length === 0)) {
    return null;
  }

  const monthLabel = formatMonthLabel(report.month);
  const selectedDiffs = diffs.pending.filter((diff) => selected.has(diff.key));
  const selectedDismissedDiffs = diffs.dismissed.filter((diff) =>
    selectedDismissed.has(diff.key),
  );
  const hasMoveWarning = (list: ClosingDiff[]) =>
    list.some((diff) => diff.movedMonthClosed);
  // 他の月との移動の情報を取得できなかった場合は、片方の月だけ反映して両月の合計が
  // ずれることを警告できないため、反映を止めて再読み込みを促す（見送りは確定値を変えない）
  const moveInfoUnavailable = !!diffs.moveInfoUnavailable;

  const handleApply = async (targets: ClosingDiff[]) => {
    if (targets.length === 0 || moveInfoUnavailable) return;
    const impact = computeDiffImpact(report, targets);
    const moveWarning = hasMoveWarning(targets)
      ? "\n※ 他の確定済みの月との間で移動した明細を含みます。移動先・移動元の月でも反映しないと、両月の合計がずれます。"
      : "";
    const confirmed = await confirmAction(
      `${monthLabel}の確定値に ${targets.length} 件の変更を反映しますか？\n${impactText(impact)}${moveWarning}`,
    );
    if (!confirmed) return;
    try {
      await applyMutation.mutateAsync({
        month: report.month,
        items: targets.map(toDiffSelection),
      });
      notifySuccess(`${targets.length} 件の変更を反映しました。`);
    } catch (error) {
      notifyError(toErrorMessage(error, "変更の反映に失敗しました。"));
    }
  };

  const handleDismiss = async () => {
    if (selectedDiffs.length === 0) return;
    const confirmed = await confirmAction(
      `${selectedDiffs.length} 件の変更を見送りますか？\n確定値は変わらず、アラートの件数から外れます。見送った後にさらに変更された場合は、再び変更として表示されます。`,
    );
    if (!confirmed) return;
    try {
      await dismissMutation.mutateAsync({
        month: report.month,
        items: selectedDiffs.map(toDiffSelection),
      });
      notifySuccess(`${selectedDiffs.length} 件の変更を見送りました。`);
    } catch (error) {
      notifyError(toErrorMessage(error, "変更の見送りに失敗しました。"));
    }
  };

  const handleUndo = async () => {
    if (selectedDismissedDiffs.length === 0) return;
    const confirmed = await confirmAction(
      `${selectedDismissedDiffs.length} 件の見送りを取り消し、未処理の変更に戻しますか？`,
    );
    if (!confirmed) return;
    try {
      await undoMutation.mutateAsync({
        month: report.month,
        items: selectedDismissedDiffs.map(toKey),
      });
      notifySuccess("見送りを取り消しました。");
    } catch (error) {
      notifyError(toErrorMessage(error, "見送りの取り消しに失敗しました。"));
    }
  };

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    key: string,
  ) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  const diffTable = (
    list: ClosingDiff[],
    selection: Set<string>,
    setSelection: React.Dispatch<React.SetStateAction<Set<string>>>,
    showDismissal: boolean,
  ) => (
    <div className="overflow-x-auto">
      <Table verticalSpacing="xs" className="whitespace-nowrap">
        <Table.Thead>
          <Table.Tr>
            <Table.Th className="w-8">
              <Checkbox
                aria-label="すべて選択"
                checked={list.length > 0 && selection.size === list.length}
                indeterminate={
                  selection.size > 0 && selection.size < list.length
                }
                onChange={(event) =>
                  setSelection(
                    event.currentTarget.checked
                      ? new Set(list.map((diff) => diff.key))
                      : new Set(),
                  )
                }
              />
            </Table.Th>
            <Table.Th>種類</Table.Th>
            <Table.Th>区分</Table.Th>
            <Table.Th>チーム</Table.Th>
            <Table.Th>案件名</Table.Th>
            <Table.Th>明細名</Table.Th>
            <Table.Th className="text-right">変更前 → 変更後</Table.Th>
            <Table.Th className="text-right">差額</Table.Th>
            {showDismissal && <Table.Th>見送り</Table.Th>}
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {list.map((diff) => {
            const note = diffNote(diff);
            const beforeTeam = diff.before?.team;
            const afterTeam = diff.after?.team;
            const beforeCategory = diff.before?.category;
            const afterCategory = diff.after?.category;
            return (
              <Table.Tr key={diff.key}>
                <Table.Td>
                  <Checkbox
                    aria-label={`${diff.matterTitle} ${diff.name}を選択`}
                    checked={selection.has(diff.key)}
                    onChange={() => toggle(setSelection, diff.key)}
                  />
                </Table.Td>
                <Table.Td>
                  <Badge
                    size="sm"
                    variant="light"
                    color={
                      diff.kind === "added"
                        ? "blue"
                        : diff.kind === "removed"
                          ? "red"
                          : "orange"
                    }
                  >
                    {diffKindLabel(diff)}
                  </Badge>
                  {note && (
                    <span className="block text-xs text-gray-500">{note}</span>
                  )}
                  {diff.movedMonthClosed && (
                    <Tooltip
                      label="相手側の月も確定済みです。片方の月だけ反映すると、両月の合計がずれます。"
                      multiline
                      w={260}
                    >
                      <span
                        className="inline-flex text-amber-600"
                        role="img"
                        aria-label="注意: 相手側の月も確定済みです"
                        tabIndex={0}
                      >
                        <FaExclamationTriangle size="0.75rem" />
                      </span>
                    </Tooltip>
                  )}
                </Table.Td>
                <Table.Td>
                  {diff.sourceType === "business" ? "売上" : "案件費用"}
                </Table.Td>
                <Table.Td>
                  {beforeTeam && afterTeam && beforeTeam !== afterTeam
                    ? `${beforeTeam} → ${afterTeam}`
                    : (afterTeam ?? beforeTeam)}
                </Table.Td>
                <Table.Td>
                  <span className="text-xs text-gray-500 mr-1">
                    #{diff.matterId}
                  </span>
                  {diff.matterTitle}
                  {beforeCategory &&
                    afterCategory &&
                    beforeCategory !== afterCategory && (
                      <span className="block text-xs text-gray-500">
                        分類: {beforeCategory} → {afterCategory}
                      </span>
                    )}
                </Table.Td>
                <Table.Td>
                  {diff.name}
                  {diff.item && (
                    <span className="text-xs text-gray-500 ml-1">
                      （{diff.item}）
                    </span>
                  )}
                </Table.Td>
                <Table.Td className="text-right">
                  {stateText(diff.before)} → {stateText(diff.after)}
                </Table.Td>
                <Table.Td
                  className={`text-right ${diff.delta === 0 ? "" : diff.delta < 0 ? "text-red-600" : "text-green-700"}`}
                >
                  {diff.delta > 0 ? "+" : ""}
                  {formatCurrency(diff.delta)}
                </Table.Td>
                {showDismissal && (
                  <Table.Td className="text-xs text-gray-600">
                    {diff.dismissal
                      ? `${formatDateTimeToJp(diff.dismissal.dismissedAt)} ${diff.dismissal.dismissedByName}`
                      : "-"}
                  </Table.Td>
                )}
                <Table.Td>
                  <Button
                    size="xs"
                    variant="light"
                    loading={loadingMatterId === diff.matterId}
                    onClick={() => onShowMatter(diff.matterId)}
                  >
                    案件を表示
                  </Button>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </div>
  );

  return (
    <div className="mb-6">
      {moveInfoUnavailable && (
        <Text size="sm" c="red" className="mb-2">
          他の確定済みの月との間で移動した明細かどうかを確認できませんでした。反映すると両月の合計がずれるおそれがあるため、画面を再読み込みしてから反映してください。
        </Text>
      )}
      {diffs.pending.length > 0 && (
        <Alert
          color="orange"
          icon={<FaExclamationTriangle />}
          title={`この月は確定後に ${diffs.pending.length} 件の変更があります`}
          className="mb-2"
        >
          <Text size="sm" className="mb-2">
            確定後に案件が変更されました。損益計算書（確定値）にはまだ反映されていません。反映する変更、または見送る変更を選んでください。
          </Text>
          {diffTable(diffs.pending, selected, setSelected, false)}
          {selectedDiffs.length > 0 && (
            <div className="mt-3">
              <Text size="xs" c="dimmed" className="mb-1">
                選択した {selectedDiffs.length} 件を反映した場合の影響額
              </Text>
              <ImpactGrid impact={computeDiffImpact(report, selectedDiffs)} />
              {hasMoveWarning(selectedDiffs) && (
                <Text size="xs" c="orange" className="mt-1">
                  他の確定済みの月との間で移動した明細を含みます。片方の月だけ反映すると、両月の合計がずれます。
                </Text>
              )}
            </div>
          )}
          <Group gap="xs" className="mt-3">
            <Button
              size="xs"
              disabled={
                selectedDiffs.length === 0 || isPending || moveInfoUnavailable
              }
              loading={applyMutation.isPending}
              onClick={() => handleApply(selectedDiffs)}
            >
              選択した変更を反映
            </Button>
            <Button
              size="xs"
              variant="light"
              disabled={isPending || moveInfoUnavailable}
              onClick={() => handleApply(diffs.pending)}
            >
              すべて反映
            </Button>
            <Button
              size="xs"
              variant="default"
              disabled={selectedDiffs.length === 0 || isPending}
              loading={dismissMutation.isPending}
              onClick={handleDismiss}
            >
              選択した変更を見送る
            </Button>
          </Group>
        </Alert>
      )}

      {diffs.dismissed.length > 0 && (
        <Paper withBorder radius="md" p="sm">
          <button
            type="button"
            aria-expanded={showDismissed}
            className="inline-flex items-center gap-2 text-sm font-bold rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            onClick={() => setShowDismissed((prev) => !prev)}
          >
            {showDismissed ? (
              <FaChevronDown size="0.7rem" />
            ) : (
              <FaChevronRight size="0.7rem" />
            )}
            見送り済み（{diffs.dismissed.length}件）
          </button>
          {showDismissed && (
            <div className="mt-2">
              {diffTable(
                diffs.dismissed,
                selectedDismissed,
                setSelectedDismissed,
                true,
              )}
              <Group gap="xs" className="mt-2">
                <Button
                  size="xs"
                  variant="default"
                  disabled={selectedDismissedDiffs.length === 0 || isPending}
                  loading={undoMutation.isPending}
                  onClick={handleUndo}
                >
                  見送りを取り消す
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  disabled={
                    selectedDismissedDiffs.length === 0 ||
                    isPending ||
                    moveInfoUnavailable
                  }
                  onClick={() => handleApply(selectedDismissedDiffs)}
                >
                  選択した変更を反映
                </Button>
              </Group>
            </div>
          )}
        </Paper>
      )}
    </div>
  );
};

export default ClosingDiffPanel;
