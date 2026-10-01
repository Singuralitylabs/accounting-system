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
  AmountList,
  AmountListRow,
  EditableTitle,
  ExpandAllButtons,
  ExpandToggle,
  TitleExtras,
  adjustmentNote,
  HIDE_ON_MOBILE,
  INDENT,
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

// Label, adjustment target, and title target for one line. The desktop row and the mobile card both render this.
type MatterLineView = {
  key: string;
  changedKey: string;
  isBusiness: boolean;
  item: string | null;
  note: string | null;
  target: AdjustmentTarget;
  label: string;
  labelTarget: LabelTarget;
  line: TitledBusinessLine | TitledCostLine;
};

const matterLineView = (
  kind: "business" | "cost",
  line: TitledBusinessLine | TitledCostLine,
  matter: MatterBreakdown,
): MatterLineView => {
  const isBusiness = kind === "business";
  const id = isBusiness
    ? (line as TitledBusinessLine).businessId
    : (line as TitledCostLine).costId;
  const item = isBusiness ? null : (line as TitledCostLine).item;
  const target: AdjustmentTarget = isBusiness
    ? { targetType: "business", businessId: id }
    : { targetType: "cost", costId: id };
  const label = isBusiness
    ? `${matter.displayTitle}の売上（${line.displayTitle}）`
    : `${matter.displayTitle}の案件費用（${line.displayTitle} / ${item}）`;
  const labelTarget: LabelTarget = isBusiness
    ? { targetType: "business", businessId: id }
    : { targetType: "cost", costId: id };
  return {
    key: `${kind}-${id}`,
    changedKey: `${kind}:${id}`,
    isBusiness,
    item,
    note: adjustmentNote(line),
    target,
    label,
    labelTarget,
    line,
  };
};

const matterLines = (matter: MatterBreakdown): MatterLineView[] => [
  ...matter.businesses.map((line) => matterLineView("business", line, matter)),
  ...matter.costs.map((line) => matterLineView("cost", line, matter)),
];

const matterAmountRows = (
  revenue: number,
  cost: number,
  grossProfit: number,
  bold = false,
): AmountListRow[] => [
  { label: "売上", value: revenue, bold },
  { label: "案件費用", value: cost, bold },
  { label: "粗利", value: grossProfit, colorize: true, bold },
];

const TOTALS_NOTE =
  "案件の合計は、損益計算書の売上総利益の「案件」行と一致します（経理追加収支は案件ではないため、この表には含みません）。";

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

  const editLineTitle = (view: MatterLineView) =>
    canEditLabels
      ? () =>
          onEditTitle(
            view.labelTarget,
            view.line.name,
            view.line.isCustomTitle ? view.line.displayTitle : null,
          )
      : undefined;

  const detailRow = (view: MatterLineView) => (
    <Table.Tr key={view.key} className="bg-gray-50">
      <Table.Td className="text-gray-600" style={INDENT.child}>
        <Badge
          size="xs"
          variant="outline"
          color={view.isBusiness ? "green" : "red"}
          className="mr-2"
        >
          {view.isBusiness ? "売上" : "費用"}
        </Badge>
        {changedKeys.has(view.changedKey) && (
          <ChangedIcon label="確定後に変更があります（未反映）" />
        )}
        <EditableTitle
          title={view.line}
          originalTitle={view.line.name}
          onEdit={editLineTitle(view)}
        />
        {view.item && (
          <span className="text-xs text-gray-500 ml-1">（{view.item}）</span>
        )}
        {view.note && (
          <span className="block text-xs text-gray-500 ml-12">{view.note}</span>
        )}
      </Table.Td>
      <Table.Td className={HIDE_ON_MOBILE} />
      <Table.Td className="text-right text-gray-600 whitespace-nowrap">
        {view.isBusiness && (
          <>
            {formatCurrency(view.line.actualAmount)}
            <AdjustmentIndicators detail={view.line} />
          </>
        )}
      </Table.Td>
      <Table.Td className="text-right text-gray-600 whitespace-nowrap">
        {!view.isBusiness && (
          <>
            {formatCurrency(view.line.actualAmount)}
            <AdjustmentIndicators detail={view.line} />
          </>
        )}
      </Table.Td>
      <Table.Td />
      <Table.Td className="text-center">
        {canEditAdjustments && (
          <AdjustmentButton
            isClosed={isClosed}
            onClick={() => onEditAdjustment(view.target, view.label, view.line)}
          />
        )}
      </Table.Td>
    </Table.Tr>
  );

  const matterKeyOf = (matterId: number) => `matter:${matterId}`;
  const matterKeys = matters.map((matter) => matterKeyOf(matter.matterId));

  // Called twice so the header (md and up) and the card list (below md) each get their own buttons.
  const renderExpandAllButtons = () => (
    <ExpandAllButtons
      label="案件別収支"
      disabled={matters.length === 0}
      onExpandAll={() => expandAll(matterKeys)}
      onCollapseAll={() => collapseAll(matterKeys)}
    />
  );

  return (
    <>
      {/* Both layouts stay mounted. CSS picks one; a viewport hook would read width 0 on first paint. */}
      <div className="mb-6 hidden overflow-x-auto md:block">
        <Paper withBorder radius="md">
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>案件別収支</Table.Th>
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
                  <div className="hidden md:block">
                    {renderExpandAllButtons()}
                  </div>
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
                    <Table.Tr
                      {...expandableRowProps(() => toggleRow(matterKey))}
                    >
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
                    {isMatterExpanded &&
                      matterLines(matter).map((view) => detailRow(view))}
                  </Fragment>
                );
              })}
              <Table.Tr className="bg-slate-100 border-t-2 border-gray-300">
                <Table.Td className="font-bold">案件の合計</Table.Td>
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
            {TOTALS_NOTE}
          </Text>
        </Paper>
      </div>
      <div className="mb-2 flex justify-end md:hidden">
        {renderExpandAllButtons()}
      </div>
      <div
        className="mb-6 space-y-3 md:hidden"
        data-testid="matter-profit-card-list"
      >
        {matters.length === 0 && (
          <Text size="sm" c="dimmed">
            この月に計上される案件はありません。
          </Text>
        )}
        {matters.map((matter) => {
          const matterKey = matterKeyOf(matter.matterId);
          const isMatterExpanded = expandedRows.has(matterKey);
          return (
            <Paper key={matterKey} withBorder radius="md" p="sm">
              <div>
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
                            matter.isCustomTitle ? matter.displayTitle : null,
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
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {matter.teams.join(" / ")}
                {matter.teams.length > 1 && <MixedValuesIcon kind="チーム" />}
              </div>
              <AmountList
                rows={matterAmountRows(
                  matter.revenue,
                  matter.cost,
                  matter.grossProfit,
                )}
              />
              <Button
                size="xs"
                variant="light"
                loading={loadingMatterId === matter.matterId}
                onClick={() => onShowMatter(matter.matterId)}
              >
                案件を表示
              </Button>
              {isMatterExpanded && (
                <ul className="m-0 mt-3 list-none border border-gray-200 p-0">
                  {matterLines(matter).map((view) => (
                    <li
                      key={view.key}
                      className="border-b border-gray-200 px-3 py-2 last:border-b-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 break-words text-sm">
                          <Badge
                            size="xs"
                            variant="outline"
                            color={view.isBusiness ? "green" : "red"}
                            className="mr-2"
                          >
                            {view.isBusiness ? "売上" : "費用"}
                          </Badge>
                          {view.line.displayTitle}
                          {view.item && (
                            <span className="ml-1 text-xs text-gray-500">
                              （{view.item}）
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-sm font-semibold">
                          {formatCurrency(view.line.actualAmount)}
                          <AdjustmentIndicators detail={view.line} />
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-600">
                        {view.note && <span>{view.note}</span>}
                        {changedKeys.has(view.changedKey) && (
                          <ChangedIcon label="確定後に変更があります（未反映）" />
                        )}
                        <TitleExtras
                          title={view.line}
                          originalTitle={view.line.name}
                          onEdit={editLineTitle(view)}
                        />
                        {canEditAdjustments && (
                          <AdjustmentButton
                            isClosed={isClosed}
                            onClick={() =>
                              onEditAdjustment(
                                view.target,
                                view.label,
                                view.line,
                              )
                            }
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Paper>
          );
        })}
        <Paper
          withBorder
          radius="md"
          p="sm"
          className="bg-slate-100 font-bold"
          // Paper's own background-color beats the utility class when Mantine CSS loads later.
          style={{ backgroundColor: "#f1f5f9" }}
        >
          <Text fw={700}>案件の合計</Text>
          <AmountList
            rows={matterAmountRows(
              totals.revenue,
              totals.cost,
              totals.grossProfit,
              true,
            )}
          />
        </Paper>
        <Text size="xs" c="dimmed">
          {TOTALS_NOTE}
        </Text>
      </div>
    </>
  );
};

export default MatterProfitTable;
