"use client";

import { Alert, Badge, Button, Group, Table } from "@mantine/core";
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
  initialMonth: string; // "YYYY-MM"（既定は翌月）
  initialData: BudgetDeclarationStatusType[] | null;
  initialDataUpdatedAt: number; // サーバで initialData を取得した時刻（epoch ms）
  // 全チームの作成・編集ができるロールか（経理・管理者）。false ならチームリーダーの
  // 自チームのみ（一覧に並ぶ行自体が自チームのみなので、この値は選択可否の表示にのみ使う）
  canEditAllTeams: boolean;
  // リマインド設定セクションを表示できるロールか（admin / accounting）。
  // 省略時は false（未対応の呼び出し元で誤って表示されないようにする）
  canManageReminderSettings?: boolean;
  // 取得済みの現在の対象日。canManageReminderSettings が true でも取得失敗時は null
  initialReminderTargetDays?: number[] | null;
};

type FormTarget = {
  team: string;
  declarationId: number | null;
  // 行をクリックした時点の対象月。month（一覧側の選択状態）をそのまま参照すると、
  // モーダル表示中に月picker を操作して month が変わった場合に対象月がズレるため、
  // クリック時点の値をここに固定する
  targetMonth: string;
};

const BudgetDeclarationList = ({
  initialMonth,
  initialData,
  initialDataUpdatedAt,
  canEditAllTeams,
  canManageReminderSettings = false,
  initialReminderTargetDays = null,
}: Props) => {
  const [month, setMonth] = useState<string>(initialMonth);
  // 明細を開いている申告（declarationId で管理する。チーム名で管理すると、
  // 申告を削除して同じチームを再申告したときに別 ID の明細が意図せず自動で開く）
  const [expandedDeclarations, setExpandedDeclarations] = useState<Set<number>>(
    new Set(),
  );
  // 作成・編集フォームで開いている対象（null なら非表示）
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
  // 月切替直後は keepPreviousData で前月の行がそのまま表示され続ける
  // （isLoading は false のまま）。この間に行の操作ボタンを押すと、表示上は
  // 新しい対象月でも実際には前月の declarationId を渡してしまうため無効化する
  const isSwitchingMonth = isPlaceholderData;

  const rows = data ?? [];
  const total = totalBudgetSummary(rows);
  // 明細を持つ（申告済みの）チームのみが「すべて開く」の対象
  const declaredDeclarationIds = rows.flatMap((row) =>
    row.declarationId !== null ? [row.declarationId] : [],
  );
  // expandedDeclarations には、申告の削除等で行から無くなった declarationId が
  // 残り続ける可能性がある（その行自体は個別にガードしているため表示上は問題ない）。
  // 「すべて閉じる」の活性判定は実際に表示されているものだけを数える
  const openDeclarationIds = declaredDeclarationIds.filter((id) =>
    expandedDeclarations.has(id),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 pb-8">
      {canManageReminderSettings && (
        <BudgetDeclarationReminderSettings
          initialTargetDays={initialReminderTargetDays}
        />
      )}
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
        // 権限不足は再読み込みしても解消しないため、案内を分ける
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
        />
      )}
    </div>
  );
};

export default BudgetDeclarationList;
