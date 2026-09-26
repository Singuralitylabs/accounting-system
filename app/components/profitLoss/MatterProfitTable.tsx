"use client";

import {
  AdjustableAmount,
  AdjustmentTarget,
  LabelTarget,
  MatterBreakdown,
  TitledBusinessLine,
  TitledCostLine,
} from "@/app/types/types";
import { formatCurrency } from "@/app/utils/formatter";
import {
  Badge,
  Button,
  Group,
  Paper,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { FaExclamationCircle } from "react-icons/fa";
import { Fragment } from "react";
import {
  AdjustmentButton,
  AdjustmentIndicators,
  EditableTitle,
  ExpandAllButtons,
  ExpandToggle,
  TitleExtras,
  adjustmentNote,
  INDENT,
  amountColor,
  expandableRowProps,
  useExpandedRows,
} from "./plTableParts";

type Props = {
  matters: MatterBreakdown[];
  // 経理追加収支（案件外）があるか。この表には含めないため、売上総利益と一致しない旨を注記する
  hasExtraEntries: boolean;
  canEditAdjustments: boolean; // 実績額修正の操作を表示するか（accounting / admin）
  isClosed?: boolean; // 確定済みの月か（Issue #148。実績額修正を無効化する）
  // 確定後に未処理の変更がある明細（"business:1" 形式）・案件（Issue #149。変更アイコンを付ける）
  changedKeys?: ReadonlySet<string>;
  changedMatterIds?: ReadonlySet<number>;
  loadingMatterId: number | null;
  onShowMatter: (matterId: number) => void;
  onEditAdjustment: (
    target: AdjustmentTarget,
    label: string,
    detail: AdjustableAmount,
  ) => void;
  canEditLabels: boolean; // 表示タイトルの変更操作を表示するか（accounting / admin）
  onEditTitle: (
    target: LabelTarget,
    originalTitle: string,
    currentTitle: string | null,
  ) => void;
};

// 確定後に未処理の変更がある行の目印（Issue #149）
const ChangedIcon = ({ label }: { label: string }) => (
  <Tooltip label={label}>
    <span
      className="inline-flex ml-1 text-orange-600 align-middle"
      role="img"
      aria-label={label}
      tabIndex={0}
    >
      <FaExclamationCircle size="0.75rem" />
    </span>
  </Tooltip>
);

// 明細によってチームが異なる案件の目印（Issue #152。確定済みの月で一部の明細だけ
// 反映した場合など。チーム別収支は明細ごとのチームで集計している）
const MixedTeamsIcon = () => {
  const label =
    "明細によってチームが異なります（確定後に一部の明細だけ反映した場合など）。チーム別収支は明細ごとのチームで集計しています";
  return (
    <Tooltip label={label} multiline w={280}>
      <span
        className="inline-flex ml-1 text-orange-600 align-middle"
        role="img"
        aria-label={label}
        tabIndex={0}
      >
        <FaExclamationCircle size="0.75rem" />
      </span>
    </Tooltip>
  );
};

// 金額 3 列（売上 / 案件費用 / 粗利）。null の列は空欄にする（明細行は該当列のみ）
const AmountCells = ({
  revenue,
  cost,
  grossProfit,
  bold = false,
}: {
  revenue: number | null;
  cost: number | null;
  grossProfit: number | null;
  bold?: boolean;
}) => (
  <>
    <Table.Td className={`text-right ${bold ? "font-bold" : ""}`}>
      {revenue === null ? "" : formatCurrency(revenue)}
    </Table.Td>
    <Table.Td className={`text-right ${bold ? "font-bold" : ""}`}>
      {cost === null ? "" : formatCurrency(cost)}
    </Table.Td>
    <Table.Td
      className={`text-right ${bold ? "font-bold" : ""} ${
        grossProfit === null ? "" : amountColor(grossProfit)
      }`}
    >
      {grossProfit === null ? "" : formatCurrency(grossProfit)}
    </Table.Td>
  </>
);

// 案件別収支（案件 → 案件内訳。Issue #147、#152 でチームの階層を廃止しチームは列で表示）。
// 案件は ID の昇順、案件内訳は売上明細 → 費用明細（各 ID 昇順）で、
// 並び順は集計側（buildMatterBreakdowns）で確定済みのものをそのまま表示する。
// 経理追加収支は案件ではないため含めない（損益計算書の下の「経理追加収支」に表示する）
const MatterProfitTable = ({
  matters,
  hasExtraEntries,
  canEditAdjustments,
  isClosed = false,
  changedKeys = new Set<string>(),
  changedMatterIds = new Set<number>(),
  loadingMatterId,
  onShowMatter,
  onEditAdjustment,
  canEditLabels,
  onEditTitle,
}: Props) => {
  const { expandedRows, toggleRow, expandAll, collapseAll } = useExpandedRows();
  const matterRevenueTotal = matters.reduce(
    (sum, matter) => sum + matter.revenue,
    0,
  );
  const matterCostTotal = matters.reduce((sum, matter) => sum + matter.cost, 0);

  const detailRow = (
    kind: "business" | "cost",
    line: TitledBusinessLine | TitledCostLine,
    matter: MatterBreakdown,
  ) => {
    const isBusiness = kind === "business";
    const id = isBusiness
      ? (line as TitledBusinessLine).businessId
      : (line as TitledCostLine).costId;
    const item = isBusiness ? null : (line as TitledCostLine).item;
    const note = adjustmentNote(line);
    const target: AdjustmentTarget = isBusiness
      ? { targetType: "business", businessId: id }
      : { targetType: "cost", costId: id };
    const label = isBusiness
      ? `${matter.displayTitle}の売上（${line.displayTitle}）`
      : `${matter.displayTitle}の案件費用（${line.displayTitle} / ${item}）`;
    const labelTarget: LabelTarget = isBusiness
      ? { targetType: "business", businessId: id }
      : { targetType: "cost", costId: id };
    return (
      <Table.Tr key={`${kind}-${id}`} className="bg-gray-50">
        <Table.Td className="text-gray-600" style={INDENT.child}>
          <Badge
            size="xs"
            variant="outline"
            color={isBusiness ? "green" : "red"}
            className="mr-2"
          >
            {isBusiness ? "売上" : "費用"}
          </Badge>
          {changedKeys.has(`${kind}:${id}`) && (
            <ChangedIcon label="確定後に変更があります（未反映）" />
          )}
          <EditableTitle
            title={line}
            originalTitle={line.name}
            onEdit={
              canEditLabels
                ? () =>
                    onEditTitle(
                      labelTarget,
                      line.name,
                      line.isCustomTitle ? line.displayTitle : null,
                    )
                : undefined
            }
          />
          {item && (
            <span className="text-xs text-gray-500 ml-1">（{item}）</span>
          )}
          {note && (
            <span className="block text-xs text-gray-500 ml-12">{note}</span>
          )}
        </Table.Td>
        <Table.Td />
        <Table.Td className="text-right text-gray-600">
          {isBusiness && (
            <>
              {formatCurrency(line.actualAmount)}
              <AdjustmentIndicators detail={line} />
            </>
          )}
        </Table.Td>
        <Table.Td className="text-right text-gray-600">
          {!isBusiness && (
            <>
              {formatCurrency(line.actualAmount)}
              <AdjustmentIndicators detail={line} />
            </>
          )}
        </Table.Td>
        <Table.Td />
        <Table.Td className="text-center">
          {canEditAdjustments && (
            <AdjustmentButton
              isClosed={isClosed}
              onClick={() => onEditAdjustment(target, label, line)}
            />
          )}
        </Table.Td>
      </Table.Tr>
    );
  };

  const matterKeyOf = (matterId: number) => `matter:${matterId}`;
  const matterKeys = matters.map((matter) => matterKeyOf(matter.matterId));

  return (
    <Paper withBorder radius="md" className="overflow-x-auto mb-6">
      <Table verticalSpacing="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>案件別収支</Table.Th>
            <Table.Th className="w-40">チーム</Table.Th>
            <Table.Th className="text-right w-32">売上</Table.Th>
            <Table.Th className="text-right w-32">案件費用</Table.Th>
            <Table.Th className="text-right w-32">粗利</Table.Th>
            {/* 列見出しの名前は「操作」（一括開閉のボタンの文言を列名として読み上げないようにする） */}
            <Table.Th className="w-36" aria-label="操作">
              <ExpandAllButtons
                label="案件別収支"
                disabled={matters.length === 0}
                onExpandAll={() => expandAll(matterKeys)}
                onCollapseAll={() => collapseAll(matterKeys)}
              />
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {matters.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={6}>
                <Text size="sm" c="dimmed">
                  この月に計上される案件はありません。
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
          {matters.map((matter) => {
            const matterKey = matterKeyOf(matter.matterId);
            const isMatterExpanded = expandedRows.has(matterKey);
            return (
              <Fragment key={matterKey}>
                <Table.Tr {...expandableRowProps(() => toggleRow(matterKey))}>
                  <Table.Td className="text-gray-700">
                    <ExpandToggle
                      isExpanded={isMatterExpanded}
                      onToggle={() => toggleRow(matterKey)}
                    >
                      <span className="text-xs text-gray-500">
                        #{matter.matterId}
                      </span>
                      {matter.displayTitle}
                    </ExpandToggle>
                    {changedMatterIds.has(matter.matterId) && (
                      <ChangedIcon label="この案件は確定後に変更があります（未反映）" />
                    )}
                    <TitleExtras
                      title={matter}
                      originalTitle={matter.matterTitle}
                      onEdit={
                        canEditLabels
                          ? () =>
                              onEditTitle(
                                {
                                  targetType: "matter",
                                  matterId: matter.matterId,
                                },
                                matter.matterTitle,
                                matter.isCustomTitle
                                  ? matter.displayTitle
                                  : null,
                              )
                          : undefined
                      }
                    />
                    <Badge
                      size="xs"
                      variant="light"
                      color="gray"
                      className="ml-2"
                    >
                      {matter.category}
                    </Badge>
                  </Table.Td>
                  <Table.Td className="text-gray-700">
                    {matter.teams.join(" / ")}
                    {matter.teams.length > 1 && <MixedTeamsIcon />}
                  </Table.Td>
                  <AmountCells
                    revenue={matter.revenue}
                    cost={matter.cost}
                    grossProfit={matter.grossProfit}
                  />
                  <Table.Td>
                    <Group justify="center" wrap="nowrap">
                      <Button
                        size="xs"
                        variant="light"
                        loading={loadingMatterId === matter.matterId}
                        onClick={(event) => {
                          event.stopPropagation();
                          onShowMatter(matter.matterId);
                        }}
                      >
                        案件を表示
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
                {isMatterExpanded && (
                  <>
                    {matter.businesses.map((line) =>
                      detailRow("business", line, matter),
                    )}
                    {matter.costs.map((line) =>
                      detailRow("cost", line, matter),
                    )}
                  </>
                )}
              </Fragment>
            );
          })}
          <Table.Tr className="bg-slate-100 border-t-2 border-gray-300">
            <Table.Td className="font-bold">案件の合計</Table.Td>
            <Table.Td />
            <AmountCells
              revenue={matterRevenueTotal}
              cost={matterCostTotal}
              grossProfit={matterRevenueTotal - matterCostTotal}
              bold
            />
            <Table.Td />
          </Table.Tr>
        </Table.Tbody>
      </Table>
      {hasExtraEntries && (
        <Text size="xs" c="dimmed" px="md" py="xs">
          経理追加収支（案件外）はこの表に含みません（下の「経理追加収支」を参照）。売上総利益には経理追加収支も含まれるため、案件の合計とは一致しません。
        </Text>
      )}
    </Paper>
  );
};

export default MatterProfitTable;
