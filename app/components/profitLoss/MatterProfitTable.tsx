"use client";

import {
  AdjustableAmount,
  AdjustmentTarget,
  LabelTarget,
  MatterBreakdown,
  MatterTotals,
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
  HIDE_ON_MOBILE,
  INDENT,
  STICKY_LABEL,
  amountColor,
  expandableRowProps,
  useExpandedRows,
} from "./plTableParts";

type Props = {
  matters: MatterBreakdown[];
  totals: MatterTotals;
  canEditAdjustments: boolean;
  isClosed?: boolean;
  changedKeys?: ReadonlySet<string>;
  changedMatterIds?: ReadonlySet<number>;
  loadingMatterId: number | null;
  onShowMatter: (matterId: number) => void;
  onEditAdjustment: (
    target: AdjustmentTarget,
    label: string,
    detail: AdjustableAmount,
  ) => void;
  canEditLabels: boolean;
  onEditTitle: (
    target: LabelTarget,
    originalTitle: string,
    currentTitle: string | null,
  ) => void;
};

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

// Matter whose lines have differing categories/teams (e.g. partially applied closed month); category and team totals aggregate per line.
const MixedValuesIcon = ({ kind }: { kind: "分類" | "チーム" }) => {
  const target = kind === "分類" ? "損益計算書の分類別の粗利" : "チーム別収支";
  const label = `明細によって${kind}が異なります（確定後に一部の明細だけ反映した場合など）。${target}は明細ごとの${kind}で集計しています`;
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
    <Table.Td
      className={`text-right whitespace-nowrap ${bold ? "font-bold" : ""}`}
    >
      {revenue === null ? "" : formatCurrency(revenue)}
    </Table.Td>
    <Table.Td
      className={`text-right whitespace-nowrap ${bold ? "font-bold" : ""}`}
    >
      {cost === null ? "" : formatCurrency(cost)}
    </Table.Td>
    <Table.Td
      className={`text-right whitespace-nowrap ${bold ? "font-bold" : ""} ${
        grossProfit === null ? "" : amountColor(grossProfit)
      }`}
    >
      {grossProfit === null ? "" : formatCurrency(grossProfit)}
    </Table.Td>
  </>
);

// Per-matter results. Order (matter ID, then revenue lines -> cost lines by ID) is fixed by buildMatterBreakdowns. Extra entries are not matters and are shown elsewhere.
const MatterProfitTable = ({
  matters,
  totals,
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
        <Table.Td
          className={`text-gray-600 max-md:bg-gray-50 ${STICKY_LABEL}`}
          style={INDENT.child}
        >
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
        <Table.Td className={HIDE_ON_MOBILE} />
        <Table.Td className="text-right text-gray-600 whitespace-nowrap">
          {isBusiness && (
            <>
              {formatCurrency(line.actualAmount)}
              <AdjustmentIndicators detail={line} />
            </>
          )}
        </Table.Td>
        <Table.Td className="text-right text-gray-600 whitespace-nowrap">
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

  // Rendered in the table header from md up and above the table below md.
  const expandAllButtons = (
    <ExpandAllButtons
      label="案件別収支"
      disabled={matters.length === 0}
      onExpandAll={() => expandAll(matterKeys)}
      onCollapseAll={() => collapseAll(matterKeys)}
    />
  );

  return (
    <>
      <div className="mb-2 flex justify-end md:hidden">{expandAllButtons}</div>
      <Paper withBorder radius="md" className="overflow-x-auto mb-6">
        <Table verticalSpacing="sm" highlightOnHover className="max-md:text-sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th className={`max-md:bg-white ${STICKY_LABEL}`}>
                案件別収支
              </Table.Th>
              <Table.Th className={`w-40 ${HIDE_ON_MOBILE}`}>チーム</Table.Th>
              <Table.Th className="text-right whitespace-nowrap md:w-32">
                売上
              </Table.Th>
              <Table.Th className="text-right whitespace-nowrap md:w-32">
                案件費用
              </Table.Th>
              <Table.Th className="text-right whitespace-nowrap md:w-32">
                粗利
              </Table.Th>
              {/* Column name is "操作" so the bulk-toggle button text is not read as the column name. */}
              <Table.Th className="md:w-36" aria-label="操作">
                <div className="hidden md:block">{expandAllButtons}</div>
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
                    <Table.Td
                      className={`text-gray-700 max-md:bg-white ${STICKY_LABEL}`}
                    >
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
                      {matter.categories.map((category) => (
                        <Badge
                          key={category}
                          size="xs"
                          variant="light"
                          color="gray"
                          className="ml-2"
                        >
                          {category}
                        </Badge>
                      ))}
                      {matter.categories.length > 1 && (
                        <MixedValuesIcon kind="分類" />
                      )}
                      {/* The team column is hidden below md; show the team under the title instead. */}
                      <span className="block text-xs text-gray-500 md:hidden">
                        {matter.teams.join(" / ")}
                      </span>
                    </Table.Td>
                    <Table.Td className={`text-gray-700 ${HIDE_ON_MOBILE}`}>
                      {matter.teams.join(" / ")}
                      {matter.teams.length > 1 && (
                        <MixedValuesIcon kind="チーム" />
                      )}
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
              <Table.Td
                className={`font-bold max-md:bg-slate-100 ${STICKY_LABEL}`}
              >
                案件の合計
              </Table.Td>
              <Table.Td className={HIDE_ON_MOBILE} />
              <AmountCells
                revenue={totals.revenue}
                cost={totals.cost}
                grossProfit={totals.grossProfit}
                bold
              />
              <Table.Td />
            </Table.Tr>
          </Table.Tbody>
        </Table>
        <Text size="xs" c="dimmed" px="md" py="xs">
          案件の合計は、損益計算書の売上総利益の「案件」行と一致します（経理追加収支は案件ではないため、この表には含みません）。
        </Text>
      </Paper>
    </>
  );
};

export default MatterProfitTable;
