"use client";

import {
  Alert,
  Badge,
  Button,
  Group,
  LoadingOverlay,
  Modal,
  NumberInput,
  Select,
  Table,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
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
};

type HeaderFormValues = {
  team: string;
  comment: string;
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
    initialValues: { team, comment: "" },
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
    form.setValues({ team, comment: "" });
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
    form.setValues({ team, comment: detail.comment ?? "" });
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
          <Table verticalSpacing="sm" className="whitespace-nowrap">
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="w-10" />
                <Table.Th className="min-w-28">種別</Table.Th>
                <Table.Th className="min-w-36">分類</Table.Th>
                <Table.Th className="min-w-44">内容</Table.Th>
                <Table.Th className="min-w-36">金額</Table.Th>
                <Table.Th className="min-w-36">担当者</Table.Th>
                <Table.Th className="w-12" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => (
                <Table.Tr key={item.key} bg={budgetEntryRowBg(item.entry_type)}>
                  <Table.Td>
                    {item.fromRecurring && (
                      <Tooltip label="定期明細から自動で追加された行です">
                        <Badge size="sm" color="blue" variant="light">
                          定期
                        </Badge>
                      </Tooltip>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Select
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
                  </Table.Td>
                  <Table.Td>
                    <Select
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
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      value={item.description}
                      placeholder="例: ○○受託案件"
                      onChange={(event) =>
                        handleUpdateItem(item.key, {
                          description: event.target.value,
                        })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
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
                  </Table.Td>
                  <Table.Td>
                    <Select
                      data={memberList}
                      value={
                        item.manager_id !== null
                          ? String(item.manager_id)
                          : null
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
                  </Table.Td>
                  <Table.Td>
                    <button
                      type="button"
                      aria-label="明細を削除"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleRemoveItem(item.key)}
                    >
                      <RiDeleteBin6Line size="1.2rem" />
                    </button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
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
              disabled={isSaving || isDetailMissing}
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
