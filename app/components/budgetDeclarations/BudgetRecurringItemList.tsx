"use client";

import {
  Alert,
  Button,
  LoadingOverlay,
  NumberInput,
  Select,
  TextInput,
} from "@mantine/core";
import { useAtomValue } from "jotai";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CiSquarePlus } from "react-icons/ci";
import { RiDeleteBin6Line } from "react-icons/ri";
import { optionsAtom } from "@/app/atoms/optionsAtom";
import {
  useBudgetRecurringItemList,
  useSaveBudgetRecurringItems,
} from "@/app/hooks/useBudgetRecurringItemData";
import {
  BudgetRecurringItemInListType,
  BudgetRecurringItemType,
} from "@/app/types/types";
import {
  categoryOptionsFor,
  isCategoryUnregistered,
  isPreWriteFailureError,
} from "@/app/utils/budgetDeclaration";
import {
  getBudgetRecurringItemValidationMessage,
  validateBudgetRecurringItemList,
} from "@/app/utils/budgetRecurringItemValidation";
import { confirmAction } from "@/app/utils/confirmAction";
import { ENTRY_TYPE_OPTIONS } from "@/app/utils/extraEntry";
import { notifyError } from "@/app/utils/notify";
import { useSaveRefreshLock } from "@/app/hooks/useSaveRefreshLock";
import { CustomMonthPicker } from "../CustomMonthPicker";
import { SaveRefreshAlert } from "../SaveRefreshAlert";

type Props = {
  initialData: BudgetRecurringItemType[];
  canEditAllTeams: boolean;
  // Fixed team for teamLocked; if unset (e.g. profile fetch failed), new rows cannot be added.
  ownTeam: string | null;
  teamList: string[];
  memberList: { value: string; label: string }[];
  memberListError?: boolean;
};

// Column widths from md up (same minimums as the former table); below md each row is a vertical block.
const ROW_GRID =
  "md:grid-cols-[minmax(9rem,1fr)_minmax(7rem,1fr)_minmax(9rem,1fr)_minmax(11rem,2fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_3rem]";

// The column header row replaces the input labels from md up.
const MOBILE_ONLY_LABEL = { label: "md:!hidden" };

const toListRows = (
  items: BudgetRecurringItemType[],
): BudgetRecurringItemInListType[] =>
  items.map((item) => ({ ...item, isNew: false, isRemoved: false }));

const BudgetRecurringItemList = ({
  initialData,
  canEditAllTeams,
  ownTeam,
  teamList,
  memberList,
  memberListError = false,
}: Props) => {
  const { categoryList, itemList } = useAtomValue(optionsAtom);
  const {
    data: recurringItems,
    isInvalidated,
    isFetching,
    isError,
    isPaused,
    refetch,
  } = useBudgetRecurringItemList(initialData);
  const saveMutation = useSaveBudgetRecurringItems();
  // Keep the overlay and block edits until the refetch after a save finishes (same as RecurringCostList).
  const {
    locked: needsReload,
    isStalled: reloadStalled,
    outcome: saveOutcome,
    markSaved,
  } = useSaveRefreshLock({
    isInvalidated: !!isInvalidated,
    isFetching: !!isFetching,
    isError: !!isError,
    isPaused: !!isPaused,
  });
  const formLocked = saveMutation.isPending || needsReload;

  const [rows, setRows] = useState<BudgetRecurringItemInListType[]>(
    toListRows(initialData),
  );
  // Editing flag; prevents background refetch from silently discarding unsaved edits (same as RecurringCostList).
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (recurringItems && !isDirty && !needsReload) {
      setRows(toListRows(recurringItems));
    }
  }, [recurringItems, isDirty, needsReload]);

  const handleUpdateRow = (
    id: number,
    updates: Partial<BudgetRecurringItemInListType>,
  ) => {
    setIsDirty(true);
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...updates } : row)),
    );
  };

  const handleAddRow = () => {
    if (!canEditAllTeams && !ownTeam) return;
    const newId =
      rows.length > 0 ? Math.max(...rows.map((row) => row.id)) + 1 : 1;
    const newRow: BudgetRecurringItemInListType = {
      id: newId,
      team: canEditAllTeams ? (teamList[0] ?? "") : (ownTeam as string),
      entry_type: "income",
      category: "",
      description: "",
      amount: 0,
      manager_id: null,
      start_month: "",
      end_month: null,
      display_order: 0,
      inserted_at: "",
      updated_at: "",
      isNew: true,
      isRemoved: false,
    };
    setIsDirty(true);
    setRows((prev) => [...prev, newRow]);
  };

  const handleRemoveRow = (id: number) => {
    setIsDirty(true);
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, isRemoved: true } : row)),
    );
  };

  // Every user sees all teams' lines, but only accounting / admin or the owner team can edit a row.
  const isEditableRow = (row: BudgetRecurringItemInListType) =>
    canEditAllTeams || (!!ownTeam && row.team === ownTeam);

  // No team and not accounting / admin: nothing can be edited or saved.
  const isViewOnly = !canEditAllTeams && !ownTeam;

  const handleSave = async () => {
    // Read-only rows (other teams) are not saved, so their problems must not block the save.
    const validation = validateBudgetRecurringItemList(
      rows.filter(isEditableRow),
      {
        categoryList,
        itemList,
      },
    );
    if (validation !== "ok") {
      notifyError(getBudgetRecurringItemValidationMessage(validation));
      return;
    }

    const confirmed = await confirmAction("定期明細を更新しますか？");
    if (!confirmed) return;

    try {
      await saveMutation.mutateAsync(rows);
      markSaved("saved");
      setIsDirty(false);
    } catch (error) {
      // Notified in the mutation's onError. Drop local edits unless the server confirmed that
      // nothing was written. A lost response can follow a completed insert, and keeping isNew rows
      // would insert them again on the next save.
      if (!isPreWriteFailureError(error)) {
        markSaved("unknown");
        setIsDirty(false);
      }
    }
  };

  const visibleRows = rows.filter((row) => !row.isRemoved);
  const unregisteredCategoryCount = visibleRows
    .filter(isEditableRow)
    .filter((row) =>
      isCategoryUnregistered(
        row.entry_type,
        row.category,
        categoryList,
        itemList,
      ),
    ).length;

  return (
    <div className="px-4 pb-8 max-w-6xl mx-auto relative">
      <LoadingOverlay
        visible={saveMutation.isPending || (!!needsReload && !!isFetching)}
      />
      {reloadStalled && (
        <SaveRefreshAlert
          subject="定期明細"
          outcome={saveOutcome}
          partialPossible
          isPaused={!!isPaused}
          onReload={() => refetch()}
        />
      )}
      <Link
        href="/budget-declarations"
        className="text-sm text-blue-600 hover:underline"
      >
        ← 事前収支申告一覧に戻る
      </Link>
      {isViewOnly && (
        <Alert color="yellow" className="mt-2" title="所属チームが未設定です">
          閲覧のみ（編集には所属チームの設定が必要です）。管理者にお問い合わせください。
        </Alert>
      )}
      <div className="flex justify-between items-center mb-4 mt-2 gap-4">
        <p className="text-sm text-gray-600">
          毎月固定で発生する収入・支出を登録します。適用期間内の対象月で新規の事前収支申告を作成すると、明細として自動で取り込まれます（取り込み後は申告ごとに編集・削除できます）。金額改定は既存行の適用終了月を設定して打ち切り、新しい行を追加してください。
        </p>
        <Button
          type="button"
          className="shrink-0"
          disabled={formLocked || isViewOnly}
          onClick={handleSave}
        >
          保存
        </Button>
      </div>
      {unregisteredCategoryCount > 0 && (
        <Alert color="yellow" title="分類の見直しが必要です" className="mb-4">
          マスタに登録されていない分類が{unregisteredCategoryCount}
          件あります。分類を選び直してください（保存できません）。
        </Alert>
      )}
      <div className="overflow-x-auto border border-gray-300 rounded bg-slate-50 p-4">
        {/* One set of inputs: a labelled vertical block on mobile, a table-like grid row from md up. */}
        <div className="md:min-w-[68rem]">
          <div
            className={`hidden gap-3 px-2 pb-2 text-sm font-bold md:grid ${ROW_GRID}`}
          >
            {[
              "チーム",
              "種別",
              "分類",
              "内容",
              "金額",
              "担当者",
              "適用開始月",
              "適用終了月",
            ].map((label) => (
              <span key={label}>{label}</span>
            ))}
            <span />
          </div>
          {visibleRows.map((row) => (
            <div
              key={row.id}
              data-testid="budget-recurring-row"
              className={`relative mb-3 grid gap-3 rounded border border-gray-200 bg-white p-3 max-md:pt-10 md:mb-0 md:items-center md:rounded-none md:border-0 md:bg-transparent md:px-2 md:py-2 ${ROW_GRID}`}
            >
              <Select
                label="チーム"
                classNames={MOBILE_ONLY_LABEL}
                value={row.team || null}
                // Keep a team removed from the master (disabled/renamed) displayable instead of blank (the saved value is unchanged; same as teamOptions in BudgetDeclarationForm).
                data={
                  row.team && !teamList.includes(row.team)
                    ? [row.team, ...teamList]
                    : teamList
                }
                disabled={!canEditAllTeams || formLocked}
                allowDeselect={false}
                placeholder="チームを選択"
                onChange={(selected) =>
                  handleUpdateRow(row.id, { team: selected ?? row.team })
                }
              />
              <Select
                label="種別"
                classNames={MOBILE_ONLY_LABEL}
                data={ENTRY_TYPE_OPTIONS}
                value={row.entry_type}
                disabled={formLocked || !isEditableRow(row)}
                allowDeselect={false}
                onChange={(value) =>
                  handleUpdateRow(row.id, {
                    entry_type: value ?? "income",
                    // Category master depends on type, so re-entry is required.
                    category: "",
                  })
                }
              />
              <Select
                label="分類"
                classNames={MOBILE_ONLY_LABEL}
                data={categoryOptionsFor(
                  row.entry_type,
                  row.category,
                  categoryList,
                  itemList,
                )}
                value={row.category || null}
                disabled={formLocked || !isEditableRow(row)}
                placeholder="分類を選択"
                error={
                  isCategoryUnregistered(
                    row.entry_type,
                    row.category,
                    categoryList,
                    itemList,
                  )
                    ? "マスタ未登録のため選び直してください"
                    : undefined
                }
                onChange={(value) =>
                  handleUpdateRow(row.id, { category: value ?? "" })
                }
              />
              <TextInput
                label="内容"
                classNames={MOBILE_ONLY_LABEL}
                value={row.description}
                disabled={formLocked || !isEditableRow(row)}
                placeholder="例: ○○保守契約"
                onChange={(event) =>
                  handleUpdateRow(row.id, {
                    description: event.target.value,
                  })
                }
              />
              <NumberInput
                label="金額"
                classNames={MOBILE_ONLY_LABEL}
                value={row.amount}
                disabled={formLocked || !isEditableRow(row)}
                min={0}
                step={1000}
                thousandSeparator=","
                prefix="¥"
                onChange={(value) =>
                  handleUpdateRow(row.id, {
                    amount: typeof value === "number" ? value : 0,
                  })
                }
              />
              <Select
                label="担当者"
                classNames={MOBILE_ONLY_LABEL}
                data={memberList}
                value={row.manager_id !== null ? String(row.manager_id) : null}
                placeholder={
                  memberListError
                    ? "担当者一覧を取得できませんでした"
                    : "担当者を選択"
                }
                disabled={memberListError || formLocked || !isEditableRow(row)}
                searchable
                clearable
                onChange={(value) =>
                  handleUpdateRow(row.id, {
                    manager_id: value ? parseInt(value, 10) : null,
                  })
                }
              />
              <CustomMonthPicker
                label="適用開始月"
                classNames={MOBILE_ONLY_LABEL}
                placeholder="開始月"
                disabled={formLocked || !isEditableRow(row)}
                value={row.start_month ? row.start_month.slice(0, 7) : null}
                onChange={(month) =>
                  handleUpdateRow(row.id, {
                    start_month: month ? `${month}-01` : "",
                  })
                }
              />
              <CustomMonthPicker
                label="適用終了月"
                classNames={MOBILE_ONLY_LABEL}
                placeholder="終了月（継続中は空欄）"
                disabled={formLocked || !isEditableRow(row)}
                value={row.end_month ? row.end_month.slice(0, 7) : null}
                onChange={(month) =>
                  handleUpdateRow(row.id, {
                    end_month: month ? `${month}-01` : null,
                  })
                }
                isClearable
              />
              <button
                type="button"
                aria-label="削除"
                className="absolute right-3 top-2 text-red-500 hover:text-red-700 disabled:text-gray-300 disabled:cursor-not-allowed md:static"
                disabled={formLocked || !isEditableRow(row)}
                onClick={() => handleRemoveRow(row.id)}
              >
                <RiDeleteBin6Line size="1.2rem" />
              </button>
            </div>
          ))}
        </div>
        {visibleRows.length === 0 && (
          <p className="text-center text-gray-500 py-6">
            定期明細が登録されていません。
          </p>
        )}
        <Button
          type="button"
          fullWidth
          className="mt-4"
          color="dark"
          variant="outline"
          rightSection={<CiSquarePlus />}
          disabled={(!canEditAllTeams && !ownTeam) || formLocked}
          onClick={handleAddRow}
        >
          定期明細追加
        </Button>
      </div>
    </div>
  );
};

export default BudgetRecurringItemList;
