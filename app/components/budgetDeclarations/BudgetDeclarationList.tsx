"use client";

import { Alert, Badge, Button, Group, Paper, Table, Text } from "@mantine/core";
import Link from "next/link";
import { Fragment, useState } from "react";
import {
  BudgetClosingInfo,
  BudgetDeclarationStatus,
  BudgetDeclarationStatusType,
} from "@/app/types/types";
import {
  useBudgetClosings,
  useBudgetDeclarationList,
} from "@/app/hooks/useBudgetDeclarationData";
import {
  BUDGET_MONTH_CLOSED_MESSAGE,
  canWriteAllBudgetTeams,
  canWriteBudgetTeam,
  isForbiddenError,
  totalBudgetSummary,
} from "@/app/utils/budgetDeclaration";
import { formatCurrency, formatTimeToJp } from "@/app/utils/formatter";
import { CustomMonthPicker } from "../CustomMonthPicker";
import { LoadingSpinner } from "../LoadingSpinner";
import BudgetClosingControl from "./BudgetClosingControl";
import BudgetDeclarationForm from "./BudgetDeclarationForm";
import BudgetDeclarationItemTable from "./BudgetDeclarationItemTable";
import BudgetDeclarationReminderSettings from "./BudgetDeclarationReminderSettings";

type Props = {
  initialMonth: string; // "YYYY-MM"
  initialData: BudgetDeclarationStatusType[] | null;
  initialDataUpdatedAt: number;
  // Viewer's role / team: writes follow canWriteBudgetTeam (accounting/admin all teams, teamleader own team only); other teams are view-only.
  profileClass: string | null;
  profileTeam?: string | null;
  // Role that can close/reopen a month (accounting/admin). Others see the state only.
  canCloseMonth?: boolean;
  initialClosings?: BudgetClosingInfo[] | null;
  // Role that can show the reminder settings button (admin / accounting). Defaults to false.
  canManageReminderSettings?: boolean;
  // null when fetch failed, even if canManageReminderSettings.
  initialReminderTargetDays?: number[] | null;
  memberList: { value: string; label: string }[];
  // Manager Select is disabled while true (see BudgetDeclarationForm).
  memberListError?: boolean;
};

const STATUS_BADGE: Record<
  BudgetDeclarationStatus,
  { label: string; color: string }
> = {
  notDeclared: { label: "未申告", color: "gray" },
  inProgress: { label: "入力中", color: "yellow" },
  declared: { label: "申告済み", color: "teal" },
};

// A header row exists (in progress or declared): amounts and lines are shown and the action is "edit".
const hasDeclaration = (row: BudgetDeclarationStatusType) =>
  row.status !== "notDeclared";

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
  profileClass,
  profileTeam = null,
  canCloseMonth = false,
  initialClosings = null,
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

  const {
    closingByMonth,
    isUnknown: closingUnknown,
    isLoadFailed: closingLoadFailed,
  } = useBudgetClosings(initialClosings ?? undefined, initialDataUpdatedAt);
  const closing = closingByMonth.get(month) ?? null;
  // Closed months lock every role; the DB rejects writes as well.
  const isClosed = closing !== null;
  // A failed closing lookup is neither "open" nor "closed": block edits until it loads.
  const editLocked = isClosed || closingUnknown;
  const canWriteTeam = (team: string) =>
    canWriteBudgetTeam(profileClass, profileTeam, team);

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
          withNavigation
          value={month}
          onChange={(selected) => {
            if (selected) {
              setMonth(selected);
              setExpandedDeclarations(new Set());
            }
          }}
          getMonthIndicator={(m) => (closingByMonth.has(m) ? "closed" : null)}
        />
      </div>

      <Paper withBorder radius="md" p="sm" className="mb-4">
        <Group gap="xl" wrap="wrap" className="mb-2">
          <div>
            <Text size="xs" c="dimmed">
              収入合計（全チーム）
            </Text>
            <Text fw={700} data-testid="budget-total-income">
              {formatCurrency(total.incomeTotal)}
            </Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              支出合計（全チーム）
            </Text>
            <Text fw={700} data-testid="budget-total-expense">
              {formatCurrency(total.expenseTotal)}
            </Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              収支
            </Text>
            <Text
              fw={700}
              c={total.balance < 0 ? "red" : undefined}
              data-testid="budget-total-balance"
            >
              {formatCurrency(total.balance)}
            </Text>
          </div>
        </Group>
        {!closingUnknown && (
          <BudgetClosingControl
            month={month}
            closing={closing}
            canClose={canCloseMonth}
            disabled={isSwitchingMonth}
          />
        )}
        {closingUnknown && !closingLoadFailed && (
          <Text size="sm" c="dimmed">
            確定状態を確認中です…
          </Text>
        )}
        {closingLoadFailed && (
          <Alert color="yellow" mt="xs" title="確定状態を取得できませんでした">
            確定状態が不明なため、申告の作成・編集を一時的に無効にしています。ページを再読み込みしてください。
          </Alert>
        )}
        {isClosed && (
          <Text size="xs" c="dimmed" mt="xs">
            {BUDGET_MONTH_CLOSED_MESSAGE}
          </Text>
        )}
      </Paper>

      {profileClass === "teamleader" && !profileTeam && (
        <Alert color="yellow" className="mb-4" title="所属チームが未設定です">
          所属チームが設定されていないため、申告の作成・編集はできません（全チームの閲覧のみ）。管理者にお問い合わせください。
        </Alert>
      )}

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
          チームマスタが未登録の可能性があります。管理者にお問い合わせください。
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
                          <Badge color={STATUS_BADGE[row.status].color}>
                            {STATUS_BADGE[row.status].label}
                          </Badge>
                          {row.status === "declared" && row.itemCount === 0 && (
                            <Text size="xs" c="dimmed">
                              明細なし
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td className="text-right">
                          {hasDeclaration(row)
                            ? formatCurrency(row.summary.incomeTotal)
                            : "-"}
                        </Table.Td>
                        <Table.Td className="text-right">
                          {hasDeclaration(row)
                            ? formatCurrency(row.summary.expenseTotal)
                            : "-"}
                        </Table.Td>
                        <Table.Td
                          className={`text-right ${
                            hasDeclaration(row) && row.summary.balance < 0
                              ? "text-red-600"
                              : ""
                          }`}
                        >
                          {hasDeclaration(row)
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
                            disabled={!hasDeclaration(row) || isSwitchingMonth}
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
                          {canWriteTeam(row.team) ? (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={isSwitchingMonth || editLocked}
                              title={
                                isClosed
                                  ? BUDGET_MONTH_CLOSED_MESSAGE
                                  : undefined
                              }
                              onClick={() =>
                                setFormTarget({
                                  team: row.team,
                                  declarationId: row.declarationId,
                                  targetMonth: month,
                                })
                              }
                            >
                              {hasDeclaration(row) ? "編集する" : "申告する"}
                            </Button>
                          ) : (
                            <Text size="xs" c="dimmed">
                              閲覧のみ
                            </Text>
                          )}
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
          teamLocked={!canWriteAllBudgetTeams(profileClass)}
          memberList={memberList}
          memberListError={memberListError}
          // Follows the live closing state of the form's own month, which can differ from the picker.
          locked={closingUnknown || closingByMonth.has(formTarget.targetMonth)}
        />
      )}
    </div>
  );
};

export default BudgetDeclarationList;
