"use client";

import { ExtraEntryInListType, ExtraEntryType } from "@/app/types/types";
import {
  ExtraEntryValidationError,
  useExtraEntryList,
  useUpsertExtraEntry,
} from "@/app/hooks/useExtraEntryData";
import { useClosedMonths } from "@/app/hooks/useClosedMonths";
import {
  CLOSED_MONTH_LOCK_MESSAGE,
  findExtraEntryLockViolations,
  isClosedMonth,
} from "@/app/utils/profitLossClosing";
import { ORG_WIDE_TEAM_LABEL } from "@/app/utils/constants";
import { selectChangedExtraEntries } from "@/app/utils/extraEntry";
import { notifyError, notifySuccess } from "@/app/utils/notify";
import { confirmAction } from "@/app/utils/confirmAction";
import {
  Autocomplete,
  Badge,
  Button,
  LoadingOverlay,
  NumberInput,
  Select,
  Table,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { CiSquarePlus } from "react-icons/ci";
import { RiDeleteBin6Line } from "react-icons/ri";
import { CustomDatePicker } from "../CustomDatePicker";

type Props = {
  initialData: ExtraEntryType[];
  incomeCategoryList: string[];
  expenseCategoryList: string[];
  paymentMethodList: string[];
  teamList: string[];
  memberList: { value: string; label: string }[];
};

const toListRows = (extraEntries: ExtraEntryType[]): ExtraEntryInListType[] =>
  extraEntries.map((entry) => ({ ...entry, isNew: false, isRemoved: false }));

const toRowMap = (extraEntries: ExtraEntryType[]) =>
  new Map(extraEntries.map((entry) => [entry.id, entry]));

// 入力済みの値から重複なしのサジェスト候補を作る（内容・請求先の入力補助用）
const toSuggestions = (values: (string | null)[]): string[] =>
  Array.from(new Set(values.filter((value): value is string => !!value)));

const ExtraEntryList = ({
  initialData,
  incomeCategoryList,
  expenseCategoryList,
  paymentMethodList,
  teamList,
  memberList,
}: Props) => {
  const { data: extraEntryList } = useExtraEntryList(initialData);
  const upsertMutation = useUpsertExtraEntry();
  // 確定済みの月（損益計算書の月次収支確定。Issue #148）のエントリは編集・削除できず、
  // 確定済みの月の日付も選べない（DB の RLS でも拒否される）
  const { closedMonths } = useClosedMonths();
  // 最新の保存済みの行（編集ロックは変更前の日付で判定する）
  const originals = useMemo(
    () => toRowMap(extraEntryList ?? initialData),
    [extraEntryList, initialData],
  );
  const isRowLocked = (row: ExtraEntryInListType) =>
    !row.isNew &&
    isClosedMonth(closedMonths, originals.get(row.id)?.entry_date);

  const [rows, setRows] = useState<ExtraEntryInListType[]>(
    toListRows(initialData),
  );
  // 編集を始めた時点（画面に読み込んだ時点）の保存済みの行。保存時は、これと比べて
  // 追加・削除・編集した行だけを送る（編集していない行を読み込み時点の値で上書きしない）
  const [baseline, setBaseline] = useState(() => toRowMap(initialData));
  // 編集中フラグ。バックグラウンド再取得（再接続時など）で
  // 保存前の編集内容が黙って破棄されるのを防ぐ
  const [isDirty, setIsDirty] = useState(false);

  // 保存後の再取得などでサーバ状態が変わったらローカル編集状態をリセットする
  // （編集中は同期しない）
  useEffect(() => {
    if (extraEntryList && !isDirty) {
      setRows(toListRows(extraEntryList));
      setBaseline(toRowMap(extraEntryList));
    }
  }, [extraEntryList, isDirty]);

  const visibleRows = rows.filter((row) => !row.isRemoved);
  const incomeRows = visibleRows.filter((row) => row.entry_type === "income");
  const expenseRows = visibleRows.filter((row) => row.entry_type === "expense");

  // 内容・請求先のサジェスト候補（編集中の行も含めた過去の入力値）
  const descriptionSuggestions = useMemo(
    () => toSuggestions(visibleRows.map((row) => row.description)),
    [visibleRows],
  );
  const billingTargetSuggestions = useMemo(
    () => toSuggestions(visibleRows.map((row) => row.billing_target)),
    [visibleRows],
  );

  const handleUpdateRow = (
    id: number,
    updates: Partial<ExtraEntryInListType>,
  ) => {
    setIsDirty(true);
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...updates } : row)),
    );
  };

  const handleAddRow = (entryType: "income" | "expense") => {
    const newId =
      rows.length > 0 ? Math.max(...rows.map((row) => row.id)) + 1 : 1;
    const newRow: ExtraEntryInListType = {
      id: newId,
      entry_type: entryType,
      category: "",
      entry_date: null,
      invoice_number: null,
      description: "",
      billing_target: null,
      manager_id: 0,
      team: null,
      billing_amount: null,
      expense_amount: null,
      payment_method: null,
      inserted_at: "",
      updated_at: "",
      isNew: true,
      isRemoved: false,
    };
    setIsDirty(true);
    setRows((prev) => [newRow, ...prev]);
  };

  const handleRemoveRow = (id: number) => {
    setIsDirty(true);
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, isRemoved: true } : row)),
    );
  };

  const handleSave = async () => {
    const activeRows = rows.filter((row) => !row.isRemoved);
    for (const row of activeRows) {
      const label = row.description || "（内容未入力の行）";
      if (!row.description) {
        notifyError("内容は必須です。未入力の欄があります。");
        return;
      }
      if (!row.category) {
        notifyError(`「${label}」の分類を選択してください。`);
        return;
      }
      if (!row.manager_id) {
        notifyError(`「${label}」の責任者を選択してください。`);
        return;
      }
      if (row.entry_type === "income") {
        if (row.billing_amount === null || row.billing_amount === 0) {
          notifyError(
            `「${label}」の請求額を入力してください（0 は登録できません）。`,
          );
          return;
        }
        if (row.expense_amount === 0) {
          notifyError(
            `「${label}」の経費が 0 円です。経費が無い場合は空欄にしてください。`,
          );
          return;
        }
      } else {
        if (row.expense_amount === null || row.expense_amount === 0) {
          notifyError(
            `「${label}」の経費を入力してください（0 は登録できません）。`,
          );
          return;
        }
        if (!row.payment_method) {
          notifyError(`「${label}」の決済方法を選択してください。`);
          return;
        }
      }
    }

    const changedRows = selectChangedExtraEntries(rows, baseline);
    if (changedRows.length === 0) {
      setIsDirty(false);
      notifySuccess("変更された項目はありません。");
      return;
    }

    const lockViolations = findExtraEntryLockViolations(
      changedRows,
      originals,
      closedMonths,
    );
    if (lockViolations.length > 0) {
      notifyError(
        `${CLOSED_MONTH_LOCK_MESSAGE}（対象: ${lockViolations.join("、")}）`,
      );
      return;
    }

    const confirmed = await confirmAction("経理追加収支の項目を更新しますか？");
    if (!confirmed) return;

    try {
      await upsertMutation.mutateAsync(changedRows);
      setIsDirty(false); // 保存成功後は再取得結果との同期を再開する
      notifySuccess("経理追加収支情報を更新しました。");
    } catch (error) {
      console.error("経理追加収支情報の保存に失敗しました。", error);
      if (error instanceof ExtraEntryValidationError) {
        // 保存前の検証で拒否された（何も書き込まれていない）
        notifyError(error.message);
        return;
      }
      notifyError(
        "経理追加収支情報の更新に失敗しました。一部のみ反映されている可能性があるため、画面を再読み込みして内容を確認してください。",
      );
    }
  };

  // ===== 共通セル =====

  const renderCategorySelect = (
    row: ExtraEntryInListType,
    categoryList: string[],
  ) => (
    <Select
      value={row.category || null}
      placeholder="分類を選択"
      data={categoryList}
      disabled={isRowLocked(row)}
      onChange={(selected) =>
        handleUpdateRow(row.id, { category: selected ?? "" })
      }
      allowDeselect={false}
    />
  );

  const renderDatePicker = (row: ExtraEntryInListType) =>
    isRowLocked(row) ? (
      <Tooltip label={CLOSED_MONTH_LOCK_MESSAGE} multiline w={260}>
        <div className="flex items-center gap-2">
          <CustomDatePicker
            placeholder="未定は空欄"
            value={row.entry_date}
            onChange={() => {}}
            disabled
          />
          <Badge size="xs" color="teal" variant="light">
            確定済み
          </Badge>
        </div>
      </Tooltip>
    ) : (
      <CustomDatePicker
        placeholder="未定は空欄"
        value={row.entry_date}
        onChange={(date) => handleUpdateRow(row.id, { entry_date: date })}
        excludeDate={(date) => isClosedMonth(closedMonths, date)}
      />
    );

  const renderDescriptionInput = (row: ExtraEntryInListType) => (
    <Autocomplete
      value={row.description}
      placeholder="内容を入力"
      data={descriptionSuggestions}
      disabled={isRowLocked(row)}
      onChange={(value) => handleUpdateRow(row.id, { description: value })}
    />
  );

  const renderManagerSelect = (row: ExtraEntryInListType) => (
    <Select
      value={row.manager_id ? String(row.manager_id) : null}
      placeholder="責任者を選択"
      data={memberList}
      searchable
      disabled={isRowLocked(row)}
      onChange={(selected) =>
        handleUpdateRow(row.id, {
          manager_id: selected ? parseInt(selected, 10) : 0,
        })
      }
      allowDeselect={false}
    />
  );

  const renderTeamSelect = (row: ExtraEntryInListType) => (
    <Select
      value={row.team ?? ORG_WIDE_TEAM_LABEL}
      data={[ORG_WIDE_TEAM_LABEL, ...teamList]}
      disabled={isRowLocked(row)}
      onChange={(selected) =>
        handleUpdateRow(row.id, {
          team: selected === ORG_WIDE_TEAM_LABEL ? null : selected,
        })
      }
      allowDeselect={false}
    />
  );

  const renderExpenseAmountInput = (
    row: ExtraEntryInListType,
    placeholder?: string,
  ) => (
    <NumberInput
      value={row.expense_amount ?? ""}
      step={1000}
      thousandSeparator=","
      prefix="¥"
      placeholder={placeholder}
      disabled={isRowLocked(row)}
      // マイナス金額（減額調整）を許容するため min は設定しない
      onChange={(value) =>
        handleUpdateRow(row.id, {
          expense_amount: typeof value === "number" ? value : null,
        })
      }
    />
  );

  const renderRemoveButton = (row: ExtraEntryInListType) => (
    <button
      type="button"
      aria-label="削除"
      className="text-red-500 hover:text-red-700 disabled:text-gray-300 disabled:cursor-not-allowed"
      disabled={isRowLocked(row)}
      title={isRowLocked(row) ? CLOSED_MONTH_LOCK_MESSAGE : undefined}
      onClick={() => handleRemoveRow(row.id)}
    >
      <RiDeleteBin6Line size="1.2rem" />
    </button>
  );

  return (
    <div className="px-4 pb-8 relative">
      <LoadingOverlay visible={upsertMutation.isPending} />
      <div className="flex justify-between items-center mb-4 gap-4">
        <p className="text-sm text-gray-600">
          案件に紐づかない収入・支出を登録します。日付の属する月の損益計算書に算入されます（日付未入力は月未確定）。金額は税別で、マイナス値による減額調整も登録できます。損益計算書で確定済みの月のエントリは編集・削除できません（確定済みの月の日付も選べません）。
        </p>
        <Button
          type="button"
          disabled={upsertMutation.isPending}
          onClick={handleSave}
        >
          保存
        </Button>
      </div>

      {/* ===== 収入 ===== */}
      <Title order={3} className="mb-2">
        収入
      </Title>
      <div className="overflow-x-auto border border-gray-300 rounded bg-slate-50 p-4 mb-8">
        <Table verticalSpacing="sm" className="whitespace-nowrap">
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="min-w-36">分類</Table.Th>
              <Table.Th className="min-w-40">日付</Table.Th>
              <Table.Th className="min-w-44">内容</Table.Th>
              <Table.Th className="min-w-32">請求書番号</Table.Th>
              <Table.Th className="min-w-40">請求先</Table.Th>
              <Table.Th className="min-w-32">責任者</Table.Th>
              <Table.Th className="min-w-32">チーム</Table.Th>
              <Table.Th className="min-w-36">請求額（税別）</Table.Th>
              <Table.Th className="min-w-36">経費（税別）</Table.Th>
              <Table.Th className="w-12" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {incomeRows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>
                  {renderCategorySelect(row, incomeCategoryList)}
                </Table.Td>
                <Table.Td>{renderDatePicker(row)}</Table.Td>
                <Table.Td>{renderDescriptionInput(row)}</Table.Td>
                <Table.Td>
                  <TextInput
                    value={row.invoice_number ?? ""}
                    placeholder="請求書番号"
                    disabled={isRowLocked(row)}
                    onChange={(event) =>
                      handleUpdateRow(row.id, {
                        invoice_number: event.target.value || null,
                      })
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Autocomplete
                    value={row.billing_target ?? ""}
                    placeholder="請求先"
                    data={billingTargetSuggestions}
                    disabled={isRowLocked(row)}
                    onChange={(value) =>
                      handleUpdateRow(row.id, {
                        billing_target: value || null,
                      })
                    }
                  />
                </Table.Td>
                <Table.Td>{renderManagerSelect(row)}</Table.Td>
                <Table.Td>{renderTeamSelect(row)}</Table.Td>
                <Table.Td>
                  <NumberInput
                    value={row.billing_amount ?? ""}
                    step={1000}
                    thousandSeparator=","
                    prefix="¥"
                    disabled={isRowLocked(row)}
                    // マイナス金額（減額調整）を許容するため min は設定しない
                    onChange={(value) =>
                      handleUpdateRow(row.id, {
                        billing_amount:
                          typeof value === "number" ? value : null,
                      })
                    }
                  />
                </Table.Td>
                <Table.Td>{renderExpenseAmountInput(row, "任意")}</Table.Td>
                <Table.Td>{renderRemoveButton(row)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {incomeRows.length === 0 && (
          <p className="text-center text-gray-500 py-6">
            収入が登録されていません。
          </p>
        )}
        <Button
          type="button"
          fullWidth
          className="mt-4"
          color="dark"
          variant="outline"
          rightSection={<CiSquarePlus />}
          onClick={() => handleAddRow("income")}
        >
          収入を追加
        </Button>
      </div>

      {/* ===== 支出 ===== */}
      <Title order={3} className="mb-2">
        支出
      </Title>
      <div className="overflow-x-auto border border-gray-300 rounded bg-slate-50 p-4">
        <Table verticalSpacing="sm" className="whitespace-nowrap">
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="min-w-36">分類</Table.Th>
              <Table.Th className="min-w-40">日付</Table.Th>
              <Table.Th className="min-w-44">内容</Table.Th>
              <Table.Th className="min-w-32">責任者</Table.Th>
              <Table.Th className="min-w-32">チーム</Table.Th>
              <Table.Th className="min-w-36">経費（税別）</Table.Th>
              <Table.Th className="min-w-36">決済方法</Table.Th>
              <Table.Th className="w-12" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {expenseRows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>
                  {renderCategorySelect(row, expenseCategoryList)}
                </Table.Td>
                <Table.Td>{renderDatePicker(row)}</Table.Td>
                <Table.Td>{renderDescriptionInput(row)}</Table.Td>
                <Table.Td>{renderManagerSelect(row)}</Table.Td>
                <Table.Td>{renderTeamSelect(row)}</Table.Td>
                <Table.Td>{renderExpenseAmountInput(row)}</Table.Td>
                <Table.Td>
                  <Select
                    value={row.payment_method}
                    placeholder="決済方法を選択"
                    data={paymentMethodList}
                    disabled={isRowLocked(row)}
                    onChange={(selected) =>
                      handleUpdateRow(row.id, { payment_method: selected })
                    }
                    allowDeselect={false}
                  />
                </Table.Td>
                <Table.Td>{renderRemoveButton(row)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {expenseRows.length === 0 && (
          <p className="text-center text-gray-500 py-6">
            支出が登録されていません。
          </p>
        )}
        <Button
          type="button"
          fullWidth
          className="mt-4"
          color="dark"
          variant="outline"
          rightSection={<CiSquarePlus />}
          onClick={() => handleAddRow("expense")}
        >
          支出を追加
        </Button>
      </div>
    </div>
  );
};

export default ExtraEntryList;
