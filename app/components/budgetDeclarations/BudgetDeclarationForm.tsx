"use client";

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  LoadingOverlay,
  Modal,
  NumberInput,
  Select,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useMediaQuery } from "@mantine/hooks";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { RiDeleteBin6Line } from "react-icons/ri";
import { CiSquarePlus } from "react-icons/ci";
import { optionsAtom } from "@/app/atoms/optionsAtom";
import {
  useBudgetDeclarationDetail,
  useDeleteBudgetDeclaration,
  usePreviousBudgetDeclarationItems,
  useSaveBudgetDeclaration,
} from "@/app/hooks/useBudgetDeclarationData";
import { useActiveBudgetRecurringItems } from "@/app/hooks/useBudgetRecurringItemData";
import { BudgetDeclarationItemInput } from "@/app/types/types";
import { confirmAction } from "@/app/utils/confirmAction";
import {
  budgetAmountColor,
  budgetEntryRowBg,
  categoryOptionsFor,
  isCategoryUnregistered,
  previousItemsToFormRows,
  summarizeBudgetItems,
} from "@/app/utils/budgetDeclaration";
import {
  getBudgetDeclarationValidationMessage,
  validateBudgetDeclarationPayload,
} from "@/app/utils/budgetDeclarationValidation";
import { ENTRY_TYPE_OPTIONS } from "@/app/utils/extraEntry";
import { formatCurrency, formatMonthLabel } from "@/app/utils/formatter";
import { notifyError } from "@/app/utils/notify";

// Column widths from md up (same minimums as the former table); below md each item is a vertical block.
const ITEM_GRID =
  "md:grid-cols-[2.5rem_minmax(7rem,1fr)_minmax(9rem,1fr)_minmax(11rem,2fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_3rem]";

// The column header row replaces the input labels from md up.
const MOBILE_ONLY_LABEL = { label: "md:!hidden" };

// fromRecurring is a display-only flag (badge); not included in the submit payload.
type ItemRow = BudgetDeclarationItemInput & {
  key: number;
  fromRecurring?: boolean;
};

const emptyItem = (key: number): ItemRow => ({
  key,
  entry_type: "income",
  category: "",
  description: "",
  amount: 0,
  manager_id: null,
});

type Props = {
  opened: boolean;
  onClose: () => void;
  targetMonth: string; // "YYYY-MM"
  team: string;
  declarationId: number | null;
  // Team select is fixed for teamleader, and always when editing (month/team pair must not change).
  teamLocked: boolean;
  memberList: { value: string; label: string }[];
  // While true, the manager Select is disabled: with an empty memberList, existing manager_id values would look cleared.
  memberListError?: boolean;
  // True when the month got closed (or its closing state is unknown) while the form is open: save and
  // delete are disabled, since the DB would reject them with MONTH_CLOSED anyway.
  locked?: boolean;
};

type HeaderFormValues = {
  team: string;
  comment: string;
  completed: boolean;
};

const BudgetDeclarationForm = ({
  opened,
  onClose,
  targetMonth,
  team,
  declarationId,
  teamLocked,
  memberList,
  memberListError = false,
  locked = false,
}: Props) => {
  const { teamList, categoryList, itemList } = useAtomValue(optionsAtom);
  const isEditMode = declarationId !== null;
  const teamFieldLocked = teamLocked || isEditMode;

  const {
    data: detail,
    isLoading: isDetailLoading,
    isError: isDetailError,
    isFetching: isDetailFetching,
  } = useBudgetDeclarationDetail(opened ? declarationId : null);

  const saveMutation = useSaveBudgetDeclaration();
  const deleteMutation = useDeleteBudgetDeclaration();
  const isSaving = saveMutation.isPending || deleteMutation.isPending;

  const form = useForm<HeaderFormValues>({
    initialValues: { team, comment: "", completed: false },
  });

  // Previous month's items for "copy previous"; enabled only for new declarations (editing waits on detail, so it is excluded) and refetched on team change and on every mount (stale after save/delete).
  const {
    data: previousItems,
    isLoading: isPreviousItemsLoading,
    isError: isPreviousItemsError,
  } = usePreviousBudgetDeclarationItems(
    opened && !isEditMode,
    targetMonth,
    form.values.team,
  );

  const copyDisabledReason = isPreviousItemsLoading
    ? "前月の申告を確認しています…"
    : isPreviousItemsError
      ? "前月の申告の確認に失敗しました。"
      : !previousItems?.length
        ? "前月の明細がありません。"
        : null;

  // Recurring items active in the target month, auto-seeded for new declarations only; refetched on team change.
  const {
    data: activeRecurringItems,
    isFetching: isActiveRecurringItemsFetching,
    isError: isActiveRecurringItemsError,
  } = useActiveBudgetRecurringItems(
    opened && !isEditMode,
    targetMonth,
    form.values.team,
  );

  // Block saving until detail is loaded when editing: saving with empty local items would replace (delete) existing items. Also wait for isDetailFetching: a stale cached detail returned while refetching (refetchOnMount: "always") could overwrite another editor's changes (the populate effect waits for the same reason).
  // For new declarations, block until recurring items are fetched (and on failure), or the declaration would be created without them (see the Alert below).
  const saveDisabled =
    isSaving ||
    locked ||
    (isEditMode
      ? !detail || isDetailFetching
      : isActiveRecurringItemsFetching || isActiveRecurringItemsError);

  // Also disable delete once the declaration is confirmed gone (detail converges to null, e.g. deleted in another tab). While fetching or failed the row may still exist, so keep it enabled.
  const isDetailMissing =
    isEditMode && !isDetailLoading && !isDetailError && !detail;

  const [items, setItems] = useState<ItemRow[]>([]);
  const nextKeyRef = useRef(0);
  // declarationId whose detail is already applied; do not overwrite in-progress input when detail refetches (invalidate after save, window refocus).
  const populatedForIdRef = useRef<number | null>(null);
  // Team whose recurring items were already seeded; do not re-seed on re-render (a row the user deleted must not reappear). Reset on reopen or team change.
  const recurringPopulatedForTeamRef = useRef<string | null>(null);

  // Reset to initial values on every open (including target row change); when editing, wait for detail so existing data is not overwritten with empty.
  useEffect(() => {
    if (!opened) return;
    form.setValues({ team, comment: "", completed: false });
    nextKeyRef.current = 0;
    setItems([]);
    populatedForIdRef.current = null;
    recurringPopulatedForTeamRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, declarationId, team]);

  // Seed recurring items active in the target month for new declarations only (not when editing, to avoid double counting). Wait for the fetch to finish so an empty array is not mistaken for "none".
  useEffect(() => {
    if (!opened || isEditMode) return;
    if (isActiveRecurringItemsFetching) return;
    if (recurringPopulatedForTeamRef.current === form.values.team) return;
    recurringPopulatedForTeamRef.current = form.values.team;
    if (!activeRecurringItems?.length) return;

    const rows = previousItemsToFormRows(activeRecurringItems).map((item) => ({
      ...item,
      key: nextKeyRef.current++,
      fromRecurring: true,
    }));
    setItems((prev) => [...prev, ...rows]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    opened,
    isEditMode,
    activeRecurringItems,
    isActiveRecurringItemsFetching,
    form.values.team,
  ]);

  useEffect(() => {
    if (!opened || !isEditMode || !detail) return;
    // A stale cache may be returned while refetching (refetchOnMount: "always"); setting populatedForIdRef then would guard the fresh data as already applied and allow a stale save (lost update). Wait until the fetch fully finishes.
    if (isDetailFetching) return;
    if (populatedForIdRef.current === declarationId) return;
    populatedForIdRef.current = declarationId;
    form.setValues({
      team,
      comment: detail.comment ?? "",
      completed: detail.completed,
    });
    setItems(
      detail.items.map((item) => ({
        key: nextKeyRef.current++,
        entry_type: item.entry_type,
        category: item.category,
        description: item.description,
        amount: item.amount,
        manager_id: item.manager_id,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, isEditMode, detail, declarationId, isDetailFetching]);

  const teamOptions = teamList.includes(team) ? teamList : [team, ...teamList];

  const handleAddItem = () => {
    setItems((prev) => [...prev, emptyItem(nextKeyRef.current++)]);
  };

  // Changing team would leave items imported for another team (copy previous can bring a whole team's items), so confirm and clear when rows exist.
  const handleTeamChange = async (value: string | null) => {
    if (!value || value === form.values.team) return;

    if (items.length > 0) {
      const confirmed = await confirmAction(
        "チームを変更すると入力済みの明細はクリアされます。変更しますか？",
      );
      if (!confirmed) return;
      setItems([]);
    }

    form.setFieldValue("team", value);
  };

  // Append previous month's items (same team) to the current rows, unsaved. Comments are not copied (likely specific to the previous month).
  const handleCopyPreviousItems = async () => {
    if (!previousItems) return;

    if (items.length > 0) {
      const confirmed = await confirmAction(
        "既に入力済みの明細があります。前月の明細を追記しますか？",
      );
      if (!confirmed) return;
    }

    const rows = previousItemsToFormRows(previousItems).map((item) => ({
      ...item,
      key: nextKeyRef.current++,
    }));
    setItems((prev) => [...prev, ...rows]);
  };

  const handleRemoveItem = (key: number) => {
    setItems((prev) => prev.filter((item) => item.key !== key));
  };

  const handleUpdateItem = (key: number, updates: Partial<ItemRow>) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...updates } : item)),
    );
  };

  // Read synchronously: the modal only mounts after a click, so there is no SSR mismatch.
  const isMobile = useMediaQuery("(max-width: 47.99em)", false, {
    getInitialValueInEffect: false,
  });

  const closeModal = () => {
    if (isSaving) return;
    onClose();
  };

  const handleSave = async () => {
    const currentTeam = form.getValues().team;
    const validation = validateBudgetDeclarationPayload(
      { targetMonth, team: currentTeam },
      items,
      { categoryList, itemList },
    );
    if (!validation.ok) {
      notifyError(getBudgetDeclarationValidationMessage(validation.reason));
      return;
    }

    const confirmed = await confirmAction(
      isEditMode
        ? `${currentTeam}の${formatMonthLabel(targetMonth)}分の事前収支申告を更新しますか？`
        : `${currentTeam}の${formatMonthLabel(targetMonth)}分の事前収支申告を作成しますか？`,
    );
    if (!confirmed) return;

    try {
      await saveMutation.mutateAsync({
        declarationId,
        targetMonth,
        team: currentTeam,
        comment: form.getValues().comment || null,
        completed: form.getValues().completed,
        items: items.map(
          ({ entry_type, category, description, amount, manager_id }) => ({
            entry_type,
            category,
            description,
            amount,
            manager_id,
          }),
        ),
      });
      onClose();
    } catch {
      // Notified in the mutation's onError.
    }
  };

  const handleDelete = async () => {
    if (declarationId === null) return;
    const currentTeam = form.getValues().team;
    const confirmed = await confirmAction(
      `${currentTeam}の${formatMonthLabel(targetMonth)}分の事前収支申告を削除しますか？\nこの操作は取り消せません。`,
      { confirmColor: "red" },
    );
    if (!confirmed) return;

    try {
      await deleteMutation.mutateAsync({ declarationId, team: currentTeam });
      onClose();
    } catch {
      // Notified in the mutation's onError.
    }
  };

  const summary = summarizeBudgetItems(items);
  // Rows whose category was removed from the master (disabled/renamed), including carried-in ones; must be reselected on save.
  const unregisteredCategoryCount = items.filter((item) =>
    isCategoryUnregistered(
      item.entry_type,
      item.category,
      categoryList,
      itemList,
    ),
  ).length;

  return (
    <Modal
      opened={opened}
      onClose={closeModal}
      title={isEditMode ? "事前収支申告の編集" : "事前収支申告の作成"}
      size="xl"
      fullScreen={isMobile}
    >
      <div className="relative">
        <LoadingOverlay
          visible={
            isSaving ||
            (isEditMode
              ? isDetailLoading || isDetailFetching
              : isActiveRecurringItemsFetching)
          }
        />

        {isEditMode && isDetailError && (
          <Alert color="red" title="申告の取得に失敗しました" className="mb-4">
            時間をおいてもう一度お試しください。
          </Alert>
        )}

        {locked && (
          <Alert color="yellow" title="この月は編集できません" className="mb-4">
            この月は確定済み（または確定状態が不明）のため、保存・削除できません。確定が解除された後、またはページを再読み込みしてからもう一度お試しください。
          </Alert>
        )}
        {isDetailMissing && (
          <Alert color="gray" title="申告が見つかりません" className="mb-4">
            既に削除されている可能性があります。一覧は自動で更新されます。
          </Alert>
        )}

        {!isEditMode && isActiveRecurringItemsError && (
          <Alert
            color="red"
            title="定期明細の確認に失敗しました"
            className="mb-4"
          >
            対象月が適用期間内の定期明細を自動投入できないため、保存を停止しています。時間をおいてもう一度お試しください。
          </Alert>
        )}

        {unregisteredCategoryCount > 0 && (
          <Alert color="yellow" title="分類の見直しが必要です" className="mb-4">
            マスタに登録されていない分類が{unregisteredCategoryCount}
            件あります。分類を選び直してください（保存できません）。
          </Alert>
        )}

        <div className="md:flex gap-4">
          <TextInput
            className="w-full"
            label="対象月"
            value={formatMonthLabel(targetMonth)}
            disabled
          />
          <Select
            className="w-full"
            label="チーム"
            required
            data={teamOptions}
            disabled={teamFieldLocked}
            allowDeselect={false}
            key={form.key("team")}
            {...form.getInputProps("team")}
            onChange={handleTeamChange}
          />
        </div>

        <Textarea
          className="mt-4"
          label="コメント"
          placeholder="補足があればご記入ください。"
          key={form.key("comment")}
          {...form.getInputProps("comment")}
        />

        <Checkbox
          className="mt-4"
          label="申告を完了する（申告済みにする）"
          description="チェックを入れて保存したときだけ「申告済み」になります。入力の途中で保存する場合は外したままにしてください。明細が無い場合も、チェックを入れれば申告済みになります。"
          key={form.key("completed")}
          {...form.getInputProps("completed", { type: "checkbox" })}
        />

        {!isEditMode && (
          <Group justify="flex-end" className="mt-4">
            <Tooltip label={copyDisabledReason} disabled={!copyDisabledReason}>
              <span>
                <Button
                  type="button"
                  variant="outline"
                  color="dark"
                  disabled={!!copyDisabledReason}
                  onClick={handleCopyPreviousItems}
                >
                  前月の明細をコピー
                </Button>
              </span>
            </Tooltip>
          </Group>
        )}

        <div className="overflow-x-auto mt-2 border border-gray-300 rounded bg-slate-50 p-4">
          {/* One set of inputs: a labelled vertical block on mobile, a table-like grid row from md up. */}
          <div className="md:min-w-[52rem]">
            <div
              className={`hidden gap-3 px-2 pb-2 text-sm font-bold md:grid ${ITEM_GRID}`}
            >
              <span />
              <span>種別</span>
              <span>分類</span>
              <span>内容</span>
              <span>金額</span>
              <span>担当者</span>
              <span />
            </div>
            {items.map((item) => (
              <div
                key={item.key}
                data-testid="budget-form-item"
                className={`relative mb-3 grid gap-3 rounded p-3 max-md:pt-10 md:mb-0 md:items-center md:rounded-none md:px-2 md:py-2 ${ITEM_GRID}`}
                style={{ backgroundColor: budgetEntryRowBg(item.entry_type) }}
              >
                <div className="absolute right-12 top-2 md:static">
                  {item.fromRecurring && (
                    <Tooltip label="定期明細から自動で追加された行です">
                      <Badge size="sm" color="blue" variant="light">
                        定期
                      </Badge>
                    </Tooltip>
                  )}
                </div>
                <Select
                  label="種別"
                  classNames={MOBILE_ONLY_LABEL}
                  data={ENTRY_TYPE_OPTIONS}
                  value={item.entry_type}
                  allowDeselect={false}
                  onChange={(value) =>
                    handleUpdateItem(item.key, {
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
                    item.entry_type,
                    item.category,
                    categoryList,
                    itemList,
                  )}
                  value={item.category || null}
                  placeholder="分類を選択"
                  error={
                    isCategoryUnregistered(
                      item.entry_type,
                      item.category,
                      categoryList,
                      itemList,
                    )
                      ? "マスタ未登録のため選び直してください"
                      : undefined
                  }
                  onChange={(value) =>
                    handleUpdateItem(item.key, { category: value ?? "" })
                  }
                />
                <TextInput
                  label="内容"
                  classNames={MOBILE_ONLY_LABEL}
                  value={item.description}
                  placeholder="例: ○○受託案件"
                  onChange={(event) =>
                    handleUpdateItem(item.key, {
                      description: event.target.value,
                    })
                  }
                />
                <NumberInput
                  label="金額"
                  classNames={MOBILE_ONLY_LABEL}
                  value={item.amount}
                  min={0}
                  step={1000}
                  thousandSeparator=","
                  prefix="¥"
                  styles={{
                    input: { color: budgetAmountColor(item.entry_type) },
                  }}
                  onChange={(value) =>
                    handleUpdateItem(item.key, {
                      amount: typeof value === "number" ? value : 0,
                    })
                  }
                />
                <Select
                  label="担当者"
                  classNames={MOBILE_ONLY_LABEL}
                  data={memberList}
                  value={
                    item.manager_id !== null ? String(item.manager_id) : null
                  }
                  placeholder={
                    memberListError
                      ? "担当者一覧を取得できませんでした"
                      : "担当者を選択"
                  }
                  disabled={memberListError}
                  searchable
                  clearable
                  onChange={(value) =>
                    handleUpdateItem(item.key, {
                      manager_id: value ? parseInt(value, 10) : null,
                    })
                  }
                />
                <button
                  type="button"
                  aria-label="明細を削除"
                  className="absolute right-3 top-2 text-red-500 hover:text-red-700 md:static"
                  onClick={() => handleRemoveItem(item.key)}
                >
                  <RiDeleteBin6Line size="1.2rem" />
                </button>
              </div>
            ))}
          </div>
          {items.length === 0 && (
            <p className="text-center text-gray-500 py-4">
              明細が登録されていません。
            </p>
          )}
          <Button
            type="button"
            fullWidth
            className="mt-4"
            color="dark"
            variant="outline"
            rightSection={<CiSquarePlus />}
            onClick={handleAddItem}
          >
            明細追加
          </Button>
        </div>

        <div className="flex justify-end gap-6 mt-4 text-sm">
          <span>収入合計: {formatCurrency(summary.incomeTotal)}</span>
          <span>支出合計: {formatCurrency(summary.expenseTotal)}</span>
          <span className={summary.balance < 0 ? "text-red-600" : ""}>
            差引: {formatCurrency(summary.balance)}
          </span>
        </div>

        <Group justify="space-between" className="mt-6">
          {isEditMode ? (
            <Button
              color="red"
              variant="outline"
              disabled={isSaving || isDetailMissing || locked}
              onClick={handleDelete}
            >
              削除
            </Button>
          ) : (
            <span />
          )}
          <Group>
            <Button variant="default" onClick={closeModal}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={saveDisabled}>
              保存
            </Button>
          </Group>
        </Group>
      </div>
    </Modal>
  );
};

export default BudgetDeclarationForm;
