"use client";

import { ExtraEntryInListType, ExtraEntryType } from "@/app/types/types";
import {
  ExtraEntryValidationError,
  ExtraEntrySuggestion,
  useExtraEntryList,
  useExtraEntrySuggestions,
  useUpsertExtraEntry,
} from "@/app/hooks/useExtraEntryData";
import { useClosedMonths } from "@/app/hooks/useClosedMonths";
import { useSaveRefreshLock } from "@/app/hooks/useSaveRefreshLock";
import {
  CLOSED_MONTH_LOCK_MESSAGE,
  findExtraEntryLockViolations,
  isClosedMonth,
} from "@/app/utils/profitLossClosing";
import {
  ORG_WIDE_TEAM_LABEL,
  teamFromLabel,
  teamLabel,
} from "@/app/utils/constants";
import { selectChangedExtraEntries } from "@/app/utils/extraEntry";
import { toFirstOfMonth } from "@/app/utils/formatter";
import { notifyError, notifySuccess } from "@/app/utils/notify";
import { confirmAction } from "@/app/utils/confirmAction";
import {
  Alert,
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
import { CustomMonthPicker } from "../CustomMonthPicker";
import { SaveRefreshAlert } from "../SaveRefreshAlert";

type Props = {
  initialMonth: string; // "YYYY-MM"
  initialData: ExtraEntryType[];
  initialDataUpdatedAt: number;
  incomeCategoryList: string[];
  expenseCategoryList: string[];
  paymentMethodList: string[];
  teamList: string[];
  initialSuggestions: ExtraEntrySuggestion[];
  memberList: { value: string; label: string }[];
};

const toListRows = (extraEntries: ExtraEntryType[]): ExtraEntryInListType[] =>
  extraEntries.map((entry) => ({ ...entry, isNew: false, isRemoved: false }));

const toRowMap = (extraEntries: ExtraEntryType[]) =>
  new Map(extraEntries.map((entry) => [entry.id, entry]));

const toSuggestions = (values: (string | null)[]): string[] =>
  Array.from(new Set(values.filter((value): value is string => !!value)));

const ExtraEntryList = ({
  initialMonth,
  initialData,
  initialDataUpdatedAt,
  incomeCategoryList,
  expenseCategoryList,
  paymentMethodList,
  teamList,
  initialSuggestions,
  memberList,
}: Props) => {
  // Target month (from `?month=` or current); the list shows that month's entries plus undated (entry_date NULL) ones.
  const [month, setMonth] = useState<string>(initialMonth);
  const {
    data: extraEntryList,
    isError,
    isPlaceholderData,
    isFetching,
    isStale,
    isPaused,
    isInvalidated,
    refetch,
  } = useExtraEntryList(
    month,
    month === initialMonth ? initialData : undefined,
    month === initialMonth ? initialDataUpdatedAt : undefined,
  );
  const upsertMutation = useUpsertExtraEntry();
  // Entries of closed months cannot be edited/deleted, nor can their dates be chosen (RLS also rejects).
  const {
    closedMonths,
    isLoading: isClosedLoading,
    isError: isClosedError,
  } = useClosedMonths();
  // While switching months keep the previous rows but block editing. A switch to a cached stale month skips the placeholder, so also lock while isFetching && isStale.
  const isSwitchingMonth = isPlaceholderData || (isFetching && isStale);
  // Lock until an invalidated list (after a save, including unknown outcomes, or a stale list from switching back/reopening) is refetched; avoids overwriting with the stale list and double registration.
  const {
    locked: isRefreshLocked,
    isStalled,
    outcome: saveOutcome,
    markSaved,
    reset: resetSaveLock,
  } = useSaveRefreshLock({
    isInvalidated,
    isFetching,
    isError,
    isPaused,
    scope: month,
  });
  const isMonthClosed = isClosedMonth(closedMonths, month);
  // Disable add while closed-month info is unavailable (loading/failed); saves are rejected by lock/RLS anyway.
  const isClosedUnknown = isClosedLoading || isClosedError;
  // Disable all inputs while switching, saving, or awaiting refetch (rows then include saved rows still marked isNew; saving again would double register).
  const formLocked =
    isSwitchingMonth || upsertMutation.isPending || isRefreshLocked;
  const canAddRow = !isMonthClosed && !isClosedUnknown && !formLocked;
  // Latest saved rows (the edit lock uses the pre-edit date).
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
  // Saved rows when editing began; on save only added/deleted/edited rows are sent (untouched rows are not overwritten with load-time values).
  const [baseline, setBaseline] = useState(() => toRowMap(initialData));
  // Editing flag; prevents background refetch from silently discarding unsaved edits.
  const [isDirty, setIsDirty] = useState(false);

  // Reset local edit state when server state changes (not while editing, switching months, or awaiting refetch).
  useEffect(() => {
    if (extraEntryList && !isDirty && !isSwitchingMonth && !isRefreshLocked) {
      setRows(toListRows(extraEntryList));
      setBaseline(toRowMap(extraEntryList));
    }
  }, [extraEntryList, isDirty, isSwitchingMonth, isRefreshLocked]);

  const visibleRows = rows.filter((row) => !row.isRemoved);
  const incomeRows = visibleRows.filter((row) => row.entry_type === "income");
  const expenseRows = visibleRows.filter((row) => row.entry_type === "expense");

  const { data: suggestionEntries } =
    useExtraEntrySuggestions(initialSuggestions);
  const descriptionSuggestions = useMemo(
    () =>
      toSuggestions([
        ...(suggestionEntries ?? []).map((row) => row.description),
        ...visibleRows.map((row) => row.description),
      ]),
    [suggestionEntries, visibleRows],
  );
  const billingTargetSuggestions = useMemo(
    () =>
      toSuggestions([
        ...(suggestionEntries ?? []).map((row) => row.billing_target),
        ...visibleRows.map((row) => row.billing_target),
      ]),
    [suggestionEntries, visibleRows],
  );

  // Confirm before switching months with unsaved edits, then discard; cancel keeps the month.
  const handleChangeMonth = async (selected: string | null) => {
    if (!selected || selected === month) return;
    if (upsertMutation.isPending) return;
    if (isDirty) {
      const confirmed = await confirmAction(
        "未保存の変更があります。破棄して対象月を切り替えますか？",
      );
      if (!confirmed) return;
      setIsDirty(false);
    }
    // Leaving the month ends the wait (the rows are replaced by the new month's list; if only a stale list remains on return, isStalled blocks editing).
    resetSaveLock();
    setMonth(selected);
  };

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
    if (!canAddRow) return;
    const newId =
      rows.length > 0 ? Math.max(...rows.map((row) => row.id)) + 1 : 1;
    const newRow: ExtraEntryInListType = {
      id: newId,
      entry_type: entryType,
      category: "",
      entry_date: toFirstOfMonth(month),
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
    // Send and validate only added/deleted/edited rows, so untouched or closed-month-locked rows with existing values do not block saving.
    const changedRows = selectChangedExtraEntries(rows, baseline);
    if (changedRows.length === 0) {
      setIsDirty(false);
      notifySuccess("変更された項目はありません。");
      return;
    }
    const activeRows = changedRows.filter((row) => !row.isRemoved);
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
      // Wait for the refetch: the hook's onSuccess invalidated the list; do not sync from the pre-save cache until the invalidation clears (isRefreshLocked). Invalidation cancels any in-flight refetch, so only a list fetched after the save clears it.
      markSaved("saved");
      setIsDirty(false);
      notifySuccess("経理追加収支情報を更新しました。");
    } catch (error) {
      console.error("経理追加収支情報の保存に失敗しました。", error);
      if (error instanceof ExtraEntryValidationError) {
        notifyError(error.message);
        if (error.staleList) {
          // Conflict: nothing was written, but the list is stale. The hook invalidated it; block editing and sync to the latest.
          markSaved("unknown");
          setIsDirty(false);
        }
        return;
      }
      // Outcome unknown (single transaction: all or nothing). The response may have been lost after commit, so saving again could double register new rows. Block editing until the refetch (invalidated in the hook's onError) and sync to the actual result.
      markSaved("unknown");
      setIsDirty(false);
      notifyError(
        "経理追加収支情報の更新結果を確認できませんでした。最新の内容を取得して表示します。保存されていなかった場合は入力し直してください。",
      );
    }
  };

  const renderCategorySelect = (
    row: ExtraEntryInListType,
    categoryList: string[],
  ) => (
    <Select
      value={row.category || null}
      placeholder="分類を選択"
      data={categoryList}
      disabled={isRowLocked(row) || formLocked}
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
      <div className="flex items-center gap-2">
        <CustomDatePicker
          placeholder="未定は空欄"
          value={row.entry_date}
          onChange={(date) => handleUpdateRow(row.id, { entry_date: date })}
          excludeDate={(date) => isClosedMonth(closedMonths, date)}
          disabled={formLocked}
        />
        {row.entry_date === null && (
          <Badge size="xs" color="gray" variant="light">
            月未確定
          </Badge>
        )}
      </div>
    );

  const renderDescriptionInput = (row: ExtraEntryInListType) => (
    <Autocomplete
      value={row.description}
      placeholder="内容を入力"
      data={descriptionSuggestions}
      disabled={isRowLocked(row) || formLocked}
      onChange={(value) => handleUpdateRow(row.id, { description: value })}
    />
  );

  const renderManagerSelect = (row: ExtraEntryInListType) => (
    <Select
      value={row.manager_id ? String(row.manager_id) : null}
      placeholder="責任者を選択"
      data={memberList}
      searchable
      disabled={isRowLocked(row) || formLocked}
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
      value={teamLabel(row.team)}
      data={[ORG_WIDE_TEAM_LABEL, ...teamList]}
      disabled={isRowLocked(row) || formLocked}
      onChange={(selected) =>
        handleUpdateRow(row.id, {
          team: teamFromLabel(selected),
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
      disabled={isRowLocked(row) || formLocked}
      // No min: negative amounts (reductions) are allowed.
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
      disabled={isRowLocked(row) || formLocked}
      title={isRowLocked(row) ? CLOSED_MONTH_LOCK_MESSAGE : undefined}
      onClick={() => handleRemoveRow(row.id)}
    >
      <RiDeleteBin6Line size="1.2rem" />
    </button>
  );

  const monthPicker = (
    <div className="mb-4 max-w-xs">
      <CustomMonthPicker
        label="対象月"
        placeholder="対象月を選択"
        value={month}
        onChange={handleChangeMonth}
        getMonthIndicator={(m) => (closedMonths.has(m) ? "closed" : null)}
      />
    </div>
  );

  // No list yet (initial load / month switch failed or loading): show only the month picker and Alert/loading.
  if (!extraEntryList) {
    return (
      <div className="px-4 pb-8 relative">
        {monthPicker}
        {isError ? (
          <Alert color="red" title="経理追加収支情報の取得に失敗しました">
            時間をおいてページを再読み込みしてください。
          </Alert>
        ) : (
          <p className="py-6 text-center text-gray-500">読み込み中…</p>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 relative">
      <LoadingOverlay
        visible={
          upsertMutation.isPending ||
          isSwitchingMonth ||
          (isRefreshLocked && isFetching)
        }
      />
      {monthPicker}
      {isStalled ? (
        <SaveRefreshAlert
          subject="経理追加収支情報"
          outcome={saveOutcome}
          isPaused={isPaused}
          onReload={() => refetch()}
        />
      ) : (
        isError &&
        !isFetching && (
          <Alert
            color="red"
            title="最新の経理追加収支情報の取得に失敗しました"
            className="mb-4"
          >
            表示中の内容は取得済みのものです。時間をおいてページを再読み込みしてください。
          </Alert>
        )
      )}
      <div className="flex justify-between items-center mb-4 gap-4">
        <p className="text-sm text-gray-600">
          案件に紐づかない収入・支出を登録します。日付の属する月の損益計算書に算入されます（日付未入力は月未確定）。
          一覧には対象月のエントリと月未確定のエントリのみ表示され、日付を別の月に変更して保存した行はその月の一覧に移ります。
          金額は税別で、マイナス値による減額調整も登録できます。損益計算書で確定済みの月のエントリは編集・削除できません（確定済みの月の日付も選べません）。
        </p>
        <Button
          type="button"
          className="shrink-0"
          disabled={formLocked}
          onClick={handleSave}
        >
          保存
        </Button>
      </div>

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
                    disabled={isRowLocked(row) || formLocked}
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
                    disabled={isRowLocked(row) || formLocked}
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
                    disabled={isRowLocked(row) || formLocked}
                    // No min: negative amounts (reductions) are allowed.
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
          disabled={!canAddRow}
          onClick={() => handleAddRow("income")}
        >
          収入を追加
        </Button>
        {isMonthClosed && (
          <p className="mt-2 text-center text-sm text-gray-600">
            {CLOSED_MONTH_LOCK_MESSAGE}のため追加できません。
          </p>
        )}
      </div>

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
                    disabled={isRowLocked(row) || formLocked}
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
          disabled={!canAddRow}
          onClick={() => handleAddRow("expense")}
        >
          支出を追加
        </Button>
        {isMonthClosed && (
          <p className="mt-2 text-center text-sm text-gray-600">
            {CLOSED_MONTH_LOCK_MESSAGE}のため追加できません。
          </p>
        )}
      </div>
    </div>
  );
};

export default ExtraEntryList;
