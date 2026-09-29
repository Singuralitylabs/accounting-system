"use client";

import { Alert, Badge, Button, Group, Table } from "@mantine/core";
import Link from "next/link";
import { Fragment, useState } from "react";
import { BudgetDeclarationStatusType } from "@/app/types/types";
import { useBudgetDeclarationList } from "@/app/hooks/useBudgetDeclarationData";
import {
  isForbiddenError,
  totalBudgetSummary,
} from "@/app/utils/budgetDeclaration";
import { formatCurrency, formatTimeToJp } from "@/app/utils/formatter";
import { CustomMonthPicker } from "../CustomMonthPicker";
import { LoadingSpinner } from "../LoadingSpinner";
import BudgetDeclarationForm from "./BudgetDeclarationForm";
import BudgetDeclarationItemTable from "./BudgetDeclarationItemTable";
import BudgetDeclarationReminderSettings from "./BudgetDeclarationReminderSettings";

type Props = {
  initialMonth: string; // "YYYY-MM"
  initialData: BudgetDeclarationStatusType[] | null;
  initialDataUpdatedAt: number;
  // Role that can create/edit all teams (accounting/admin); otherwise teamleader's own team only (rows are already own-team only, so this affects the select UI only).
  canEditAllTeams: boolean;
  // Role that can show the reminder settings button (admin / accounting). Defaults to false.
  canManageReminderSettings?: boolean;
  // null when fetch failed, even if canManageReminderSettings.
  initialReminderTargetDays?: number[] | null;
  memberList: { value: string; label: string }[];
  // Manager Select is disabled while true (see BudgetDeclarationForm).
  memberListError?: boolean;
};

type FormTarget = {
  team: string;
  declarationId: number | null;
  // Month at click time; referencing month directly would shift if the month picker changes while the modal is open.
  targetMonth: string; // "YYYY-MM"
};

const BudgetDeclarationList = ({
  initialMonth,
  initialData,
  initialDataUpdatedAt,
  canEditAllTeams,
  canManageReminderSettings = false,
  initialReminderTargetDays = null,
  memberList,
  memberListError = false,
}: Props) => {
  const [month, setMonth] = useState<string>(initialMonth);
  // Keyed by declarationId; keying by team name would auto-open a re-created declaration's items with a different id.
  const [expandedDeclarations, setExpandedDeclarations] = useState<Set<number>>(
    new Set(),
  );
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);

  const toggleDeclaration = (declarationId: number) => {
    setExpandedDeclarations((prev) => {
      const next = new Set(prev);
      if (next.has(declarationId)) {
        next.delete(declarationId);
      } else {
        next.add(declarationId);
      }
      return next;
    });
  };

  const { data, isLoading, isError, error, isPlaceholderData } =
    useBudgetDeclarationList(
      month,
      month === initialMonth ? (initialData ?? undefined) : undefined,
      initialDataUpdatedAt,
    );
  // Right after a month switch keepPreviousData still shows the previous month's rows (isLoading stays false); disable row actions or they would pass the previous month's declarationId.
  const isSwitchingMonth = isPlaceholderData;

  const rows = data ?? [];
  const total = totalBudgetSummary(rows);
  const declaredDeclarationIds = rows.flatMap((row) =>
    row.declarationId !== null ? [row.declarationId] : [],
  );
  // expandedDeclarations may keep ids of removed rows; count only displayed rows.
  const openDeclarationIds = declaredDeclarationIds.filter((id) =>
    expandedDeclarations.has(id),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 pb-8">
      <Group justify="flex-end" className="mb-2">
        {/* Modal-opened rather than always expanded; kept mounted so saved values persist across open/close. */}
        {canManageReminderSettings && (
          <BudgetDeclarationReminderSettings
            initialTargetDays={initialReminderTargetDays}
          />
        )}
        <Button
          component={Link}
          href="/budget-declarations/recurring"
          size="xs"
          variant="light"
        >
          定期明細を管理
        </Button>
      </Group>
      <div className="mb-4 max-w-xs">
        <CustomMonthPicker
          label="対象月"
          placeholder="対象月を選択"
          value={month}
          onChange={(selected) => {
            if (selected) {
              setMonth(selected);
              setExpandedDeclarations(new Set());
            }
          }}
        />
      </div>

      {isError ? (
        // Insufficient permission is not fixed by reloading; use a separate message.
        <Alert
          color="red"
          title={
            isForbiddenError(error)
              ? "事前収支申告の閲覧権限がありません"
              : "事前収支申告の取得に失敗しました"
          }
        >
          {isForbiddenError(error)
            ? "権限が変更された可能性があります。管理者にお問い合わせください。"
            : "時間をおいてページを再読み込みしてください。"}
        </Alert>
      ) : isLoading ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <Alert color="gray" title="表示できるチームがありません">
          チームマスタが未登録か、所属チームが設定されていない可能性があります。
        </Alert>
      ) : (
        <>
          <Group justify="flex-end" mb="xs">
            <Button
              size="xs"
              variant="default"
              disabled={declaredDeclarationIds.length === 0 || isSwitchingMonth}
              onClick={() =>
                setExpandedDeclarations(new Set(declaredDeclarationIds))
              }
            >
              すべて開く
            </Button>
            <Button
              size="xs"
              variant="default"
              disabled={openDeclarationIds.length === 0}
              onClick={() => setExpandedDeclarations(new Set())}
            >
              すべて閉じる
            </Button>
          </Group>
          <div className="overflow-x-auto">
            <Table withTableBorder withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>チーム</Table.Th>
                  <Table.Th>申告状況</Table.Th>
                  <Table.Th className="text-right">収入合計</Table.Th>
                  <Table.Th className="text-right">支出合計</Table.Th>
                  <Table.Th className="text-right">差引</Table.Th>
                  <Table.Th>申告者</Table.Th>
                  <Table.Th>最終更新</Table.Th>
                  <Table.Th>明細</Table.Th>
                  <Table.Th>操作</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => {
                  const isExpanded =
                    row.declarationId !== null &&
                    expandedDeclarations.has(row.declarationId);
                  return (
                    <Fragment key={row.team}>
                      <Table.Tr>
                        <Table.Td>{row.team}</Table.Td>
                        <Table.Td>
                          <Badge color={row.isDeclared ? "teal" : "gray"}>
                            {row.isDeclared ? "申告済み" : "未申告"}
                          </Badge>
                        </Table.Td>
                        <Table.Td className="text-right">
                          {row.isDeclared
                            ? formatCurrency(row.summary.incomeTotal)
                            : "-"}
                        </Table.Td>
                        <Table.Td className="text-right">
                          {row.isDeclared
                            ? formatCurrency(row.summary.expenseTotal)
                            : "-"}
                        </Table.Td>
                        <Table.Td
                          className={`text-right ${
                            row.isDeclared && row.summary.balance < 0
                              ? "text-red-600"
                              : ""
                          }`}
                        >
                          {row.isDeclared
                            ? formatCurrency(row.summary.balance)
                            : "-"}
                        </Table.Td>
                        <Table.Td>{row.declaredByName ?? "-"}</Table.Td>
                        <Table.Td>
                          {row.updatedAt ? formatTimeToJp(row.updatedAt) : "-"}
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            variant="subtle"
                            disabled={!row.isDeclared || isSwitchingMonth}
                            onClick={() => {
                              if (row.declarationId !== null) {
                                toggleDeclaration(row.declarationId);
                              }
                            }}
                          >
                            {isExpanded ? "閉じる" : "明細を表示"}
                          </Button>
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={isSwitchingMonth}
                            onClick={() =>
                              setFormTarget({
                                team: row.team,
                                declarationId: row.declarationId,
                                targetMonth: month,
                              })
                            }
                          >
                            {row.isDeclared ? "編集する" : "申告する"}
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                      {isExpanded && row.declarationId !== null && (
                        <Table.Tr>
                          <Table.Td colSpan={9}>
                            <BudgetDeclarationItemTable
                              declarationId={row.declarationId}
                            />
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Fragment>
                  );
                })}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Th colSpan={2}>合計</Table.Th>
                  <Table.Th className="text-right">
                    {formatCurrency(total.incomeTotal)}
                  </Table.Th>
                  <Table.Th className="text-right">
                    {formatCurrency(total.expenseTotal)}
                  </Table.Th>
                  <Table.Th className="text-right">
                    {formatCurrency(total.balance)}
                  </Table.Th>
                  <Table.Th colSpan={4} />
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </div>
        </>
      )}

      {formTarget && (
        <BudgetDeclarationForm
          opened
          onClose={() => setFormTarget(null)}
          targetMonth={formTarget.targetMonth}
          team={formTarget.team}
          declarationId={formTarget.declarationId}
          teamLocked={!canEditAllTeams}
          memberList={memberList}
          memberListError={memberListError}
        />
      )}
    </div>
  );
};

export default BudgetDeclarationList;
