"use client";

import {
  AdjustableAmount,
  AdjustmentTarget,
  LabelTarget,
  MatterBreakdown,
  TeamMatterGroup,
  TitledBusinessLine,
  TitledCostLine,
} from "@/app/types/types";
import { formatCurrency } from "@/app/utils/formatter";
import { formatEntryType } from "@/app/utils/extraEntry";
import { ORG_WIDE_TEAM_LABEL } from "@/app/utils/constants";
import { Badge, Button, Group, Paper, Table, Text } from "@mantine/core";
import { Fragment } from "react";
import {
  AdjustmentIndicators,
  EditableTitle,
  ExpandToggle,
  TitleExtras,
  adjustmentNote,
  amountColor,
  expandableRowProps,
  useExpandedRows,
} from "./plTableParts";

type Props = {
  groups: TeamMatterGroup[];
  revenueTotal: number;
  matterCostTotal: number;
  grossProfitTotal: number;
  canEditAdjustments: boolean; // 実績額修正の操作を表示するか（accounting / admin）
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

const teamLabel = (team: string | null) => team ?? ORG_WIDE_TEAM_LABEL;

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

// 案件別収支（チーム → 案件 → 案件内訳）。Issue #147
// チームはマスタの並び順、案件は ID の昇順、案件内訳は売上明細 → 費用明細（各 ID 昇順）で、
// 並び順は集計側（buildTeamMatterGroups）で確定済みのものをそのまま表示する。
const MatterProfitTable = ({
  groups,
  revenueTotal,
  matterCostTotal,
  grossProfitTotal,
  canEditAdjustments,
  loadingMatterId,
  onShowMatter,
  onEditAdjustment,
  canEditLabels,
  onEditTitle,
}: Props) => {
  const { expandedRows, toggleRow } = useExpandedRows();

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
        <Table.Td className="pl-20 text-gray-600">
          <Badge
            size="xs"
            variant="outline"
            color={isBusiness ? "green" : "red"}
            className="mr-2"
          >
            {isBusiness ? "売上" : "費用"}
          </Badge>
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
            <Button
              size="xs"
              variant="subtle"
              onClick={(event) => {
                event.stopPropagation();
                onEditAdjustment(target, label, line);
              }}
            >
              実績額を修正
            </Button>
          )}
        </Table.Td>
      </Table.Tr>
    );
  };

  return (
    <Paper withBorder radius="md" className="overflow-x-auto mb-6">
      <Table verticalSpacing="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>案件別収支</Table.Th>
            <Table.Th className="text-right w-32">売上</Table.Th>
            <Table.Th className="text-right w-32">案件費用</Table.Th>
            <Table.Th className="text-right w-32">粗利</Table.Th>
            <Table.Th className="w-36" />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {groups.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text size="sm" c="dimmed">
                  この月に計上される案件・経理追加収支はありません。
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
          {groups.map((group) => {
            const teamKey = `team:${teamLabel(group.team)}`;
            const isTeamExpanded = expandedRows.has(teamKey);
            const extraKey = `${teamKey}:extra`;
            const isExtraExpanded = expandedRows.has(extraKey);
            return (
              <Fragment key={teamKey}>
                <Table.Tr
                  {...expandableRowProps(() => toggleRow(teamKey))}
                  className="cursor-pointer bg-slate-50"
                >
                  <Table.Td className="font-bold">
                    <ExpandToggle
                      isExpanded={isTeamExpanded}
                      onToggle={() => toggleRow(teamKey)}
                    >
                      {teamLabel(group.team)}
                      {group.team === null && (
                        <span className="text-xs text-gray-500 font-normal">
                          （チーム未指定の経理追加収支）
                        </span>
                      )}
                    </ExpandToggle>
                  </Table.Td>
                  <AmountCells
                    revenue={group.revenue}
                    cost={group.cost}
                    grossProfit={group.grossProfit}
                    bold
                  />
                  <Table.Td />
                </Table.Tr>
                {isTeamExpanded && (
                  <>
                    {group.matters.map((matter) => {
                      const matterKey = `matter:${matter.matterId}`;
                      const isMatterExpanded = expandedRows.has(matterKey);
                      return (
                        <Fragment key={matterKey}>
                          <Table.Tr
                            {...expandableRowProps(() => toggleRow(matterKey))}
                          >
                            <Table.Td className="pl-8 text-gray-700">
                              <ExpandToggle
                                isExpanded={isMatterExpanded}
                                onToggle={() => toggleRow(matterKey)}
                              >
                                <span className="text-xs text-gray-500">
                                  #{matter.matterId}
                                </span>
                                {matter.displayTitle}
                              </ExpandToggle>
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
                    {group.extraEntries.length > 0 && (
                      <>
                        <Table.Tr
                          {...expandableRowProps(() => toggleRow(extraKey))}
                        >
                          <Table.Td className="pl-8 text-gray-700">
                            <ExpandToggle
                              isExpanded={isExtraExpanded}
                              onToggle={() => toggleRow(extraKey)}
                            >
                              経理追加収支（案件外）
                            </ExpandToggle>
                          </Table.Td>
                          <AmountCells
                            revenue={group.extraRevenue}
                            cost={group.extraCost}
                            grossProfit={group.extraRevenue - group.extraCost}
                          />
                          <Table.Td />
                        </Table.Tr>
                        {/* 経理追加収支は案件に紐づかないため「案件を表示」・実績額修正の対象外 */}
                        {isExtraExpanded &&
                          group.extraEntries.map((entry) => (
                            <Table.Tr
                              key={`extra-${entry.extraEntryId}`}
                              className="bg-gray-50"
                            >
                              <Table.Td className="pl-20 text-gray-600">
                                <Badge
                                  size="xs"
                                  variant="outline"
                                  color={
                                    entry.entryType === "income"
                                      ? "green"
                                      : "red"
                                  }
                                  className="mr-2"
                                >
                                  {formatEntryType(entry.entryType)}
                                </Badge>
                                {entry.description}
                                <span className="text-xs text-gray-500 ml-1">
                                  （{entry.category}）
                                </span>
                              </Table.Td>
                              <Table.Td className="text-right text-gray-600">
                                {entry.entryType === "income"
                                  ? formatCurrency(entry.billingAmount)
                                  : ""}
                              </Table.Td>
                              <Table.Td className="text-right text-gray-600">
                                {entry.expenseAmount !== null
                                  ? formatCurrency(entry.expenseAmount)
                                  : ""}
                              </Table.Td>
                              <Table.Td />
                              <Table.Td />
                            </Table.Tr>
                          ))}
                      </>
                    )}
                  </>
                )}
              </Fragment>
            );
          })}
          <Table.Tr className="bg-slate-100 border-t-2 border-gray-300">
            <Table.Td className="font-bold">合計</Table.Td>
            <AmountCells
              revenue={revenueTotal}
              cost={matterCostTotal}
              grossProfit={grossProfitTotal}
              bold
            />
            <Table.Td />
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </Paper>
  );
};

export default MatterProfitTable;
