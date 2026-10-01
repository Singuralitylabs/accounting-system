"use client";

import {
  Alert,
  Badge,
  Button,
  Group,
  LoadingOverlay,
  Paper,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { SelectOptionType } from "../types/types";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkUpsertSelectOptions,
  InsertedSelectOptionId,
  SelectOptionToSave,
} from "../utils/supabase/selectOptions";
import { notifyError, notifySuccess } from "../utils/notify";
import { confirmAction } from "../utils/confirmAction";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { OptionRowStatus, SortableTableRow } from "./SortableTableRow";
import { OPTION_CLASSES, getOptionLabel } from "../utils/selectOptionClasses";
import { useReportDashboardUnsavedChanges } from "./dashboard/DashboardUnsavedChanges";

type OptionRow = Pick<
  SelectOptionType,
  "id" | "value" | "display_order" | "is_active"
> & { isNew: boolean };

const toOptionRows = (
  optionList: Pick<
    SelectOptionType,
    "id" | "value" | "display_order" | "is_active"
  >[],
): OptionRow[] => optionList.map((option) => ({ ...option, isNew: false }));

// For change detection (order, name, display order, enabled, added rows); rows added then deleted are never saved, so excluded.
const optionRowsKey = (rows: OptionRow[]) =>
  JSON.stringify(
    rows
      .filter((row) => !(row.isNew && !row.is_active))
      .map((row) => [
        row.id,
        row.isNew,
        row.value,
        row.display_order,
        row.is_active,
      ]),
  );

export const hasOptionListChanges = (
  baseline: OptionRow[],
  rows: OptionRow[],
) => optionRowsKey(baseline) !== optionRowsKey(rows);

// Replace saved rows' temporary ids with DB ids (isNew: false) in baseline and display, so saving again before the refetch (router.refresh) does not re-add rows and deleting a saved row is sent as a disable (UPDATE). If a deleted row was re-enabled by adding the same name, the added row takes that id, so drop the remaining deleted row with the same id.
export const applyInsertedOptionIds = (
  rows: OptionRow[],
  insertedIds: InsertedSelectOptionId[],
): OptionRow[] => {
  const idByTempId = new Map(insertedIds.map(({ tempId, id }) => [tempId, id]));
  const insertedDbIds = new Set(insertedIds.map(({ id }) => id));
  return rows
    .filter((row) => row.isNew || !insertedDbIds.has(row.id))
    .map((row) => {
      const id = row.isNew ? idByTempId.get(row.id) : undefined;
      return id === undefined ? row : { ...row, id, isNew: false };
    });
};

// Rows to send: changed existing rows (name, display order or enabled differs from baseline, including reorder-only) and added rows (excluding added-then-deleted); unchanged rows are not UPDATEd. Existing rows carry valueChanged (server UPDATEs renamed rows one by one, others in parallel). Rows with unset (null / 0) display order get their row position, as when all rows were sent.
export const optionRowsToSave = (
  baseline: OptionRow[],
  rows: OptionRow[],
): SelectOptionToSave[] => {
  const baselineById = new Map(baseline.map((row) => [row.id, row]));
  return rows.flatMap((row): SelectOptionToSave[] => {
    const display_order = row.display_order || rows.length;
    if (row.isNew) return row.is_active ? [{ ...row, display_order }] : [];
    const saved = baselineById.get(row.id);
    if (
      saved &&
      saved.value === row.value &&
      saved.display_order === row.display_order &&
      saved.is_active === row.is_active
    ) {
      return [];
    }
    return [
      {
        ...row,
        display_order,
        valueChanged: !saved || saved.value !== row.value,
      },
    ];
  });
};

const withoutDiscardedNewRows = (rows: OptionRow[]) =>
  rows.filter((row) => !(row.isNew && !row.is_active));

// Whether a partially failed save had persisted changed content (an added row, or an UPDATEd existing row that differs from baseline). sentRows is all rows at save time.
export const hasPartiallySavedChanges = (
  baseline: OptionRow[],
  sentRows: OptionRow[],
  insertedIds: InsertedSelectOptionId[],
  updatedIds: number[],
) => {
  if (insertedIds.length > 0) return true;
  const baselineKeyById = new Map(
    baseline.map((row) => [row.id, optionRowsKey([row])]),
  );
  const updated = new Set(updatedIds);
  return sentRows.some(
    (row) =>
      !row.isNew &&
      updated.has(row.id) &&
      baselineKeyById.get(row.id) !== optionRowsKey([row]),
  );
};

// New baseline after a partial failure: saved rows (UPDATEd existing and added, with DB ids) take the sent content; unsaved existing and unsent rows keep the old baseline; unsaved added rows are excluded (not in the DB). Row order follows sentRows. This way, reverting a saved change on screen still counts as unsaved, so saving again syncs the DB to the screen.
export const baselineAfterPartialSave = (
  baseline: OptionRow[],
  sentRows: OptionRow[],
  insertedIds: InsertedSelectOptionId[],
  updatedIds: number[],
): OptionRow[] => {
  const baselineById = new Map(baseline.map((row) => [row.id, row]));
  const insertedTempIds = new Set(insertedIds.map(({ tempId }) => tempId));
  const updated = new Set(updatedIds);
  const merged = sentRows.flatMap((row) => {
    if (row.isNew) return insertedTempIds.has(row.id) ? [row] : [];
    if (updated.has(row.id)) return [row];
    const saved = baselineById.get(row.id);
    return saved ? [saved] : [];
  });
  return applyInsertedOptionIds(merged, insertedIds);
};

// First duplicate name among displayed (enabled) rows; names are unique per type (UNIQUE(type_id, value)), so stop before saving.
export const findDuplicateOptionValue = (rows: OptionRow[]) => {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.is_active) continue;
    if (seen.has(row.value)) return row.value;
    seen.add(row.value);
  }
  return undefined;
};

// Number of rows a save would send (changed, reordered, added and removed rows).
export const countOptionChanges = (baseline: OptionRow[], rows: OptionRow[]) =>
  optionRowsToSave(baseline, rows).length;

export const countActiveOptions = (rows: { is_active: boolean | null }[]) =>
  rows.filter((row) => row.is_active).length;

// Input errors on displayed rows: empty names and names shared by several rows, keyed by row id.
export const findOptionRowErrors = (rows: OptionRow[]) => {
  const errors = new Map<number, string>();
  const idsByValue = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.is_active) continue;
    if (!row.value) {
      errors.set(row.id, "項目名を入力してください");
      continue;
    }
    idsByValue.set(row.value, [...(idsByValue.get(row.value) ?? []), row.id]);
  }
  for (const ids of Array.from(idsByValue.values())) {
    if (ids.length > 1) {
      for (const id of ids) errors.set(id, "項目名が重複しています");
    }
  }
  return errors;
};

export type OptionListStatus = { count: number; changeCount: number };

const SelectOptionList = ({
  optionClass,
  optionList,
  onStatusChange,
}: {
  optionClass: string;
  optionList: Pick<
    SelectOptionType,
    "id" | "value" | "display_order" | "is_active"
  >[];
  // Reports the enabled row count and unsaved change count so the parent can show badges and dots.
  onStatusChange?: (optionClass: string, status: OptionListStatus) => void;
}) => {
  const [updatedOptionList, setUpdatedOptionList] = useState<OptionRow[]>(() =>
    toOptionRows(optionList),
  );
  // State when loaded (or at the last successful save); compared to detect unsaved changes, reported to DashboardNav for the confirm before switching.
  const [baseline, setBaseline] = useState<OptionRow[]>(() =>
    toOptionRows(optionList),
  );
  const [isLoading, setIsLoading] = useState(false);
  // router.refresh() resolves after the server render; keep the overlay until then.
  const [isRefreshPending, startRefresh] = useTransition();
  // Input errors are shown only after a save attempt, so a freshly added empty row is not flagged.
  const [showErrors, setShowErrors] = useState(false);
  const [focusTarget, setFocusTarget] = useState<number | "add" | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const refreshPage = () => {
    startRefresh(() => {
      router.refresh();
    });
  };
  const hasChanges = hasOptionListChanges(baseline, updatedOptionList);
  const changeCount = countOptionChanges(baseline, updatedOptionList);
  const activeCount = countActiveOptions(updatedOptionList);
  const rowErrors = useMemo(
    () => findOptionRowErrors(updatedOptionList),
    [updatedOptionList],
  );
  const baselineById = useMemo(
    () => new Map(baseline.map((row) => [row.id, row])),
    [baseline],
  );
  useReportDashboardUnsavedChanges(hasChanges);

  // Sync the display after router.refresh etc. only when there are no unsaved changes (reflects DB ids for saved rows without silently discarding edits; syncs once edits end).
  const syncedOptionListRef = useRef(optionList);
  // Latest props, so a successful save can treat them as synced.
  const latestOptionListRef = useRef(optionList);
  latestOptionListRef.current = optionList;
  useEffect(() => {
    if (!hasChanges && optionList !== syncedOptionListRef.current) {
      syncedOptionListRef.current = optionList;
      const rows = toOptionRows(optionList);
      setUpdatedOptionList(rows);
      setBaseline(rows);
    }
  }, [optionList, hasChanges]);

  const optionTitle = getOptionLabel(optionClass);
  const optionDescription = OPTION_CLASSES.find(
    (option) => option.optionClass === optionClass,
  )?.description;

  useEffect(() => {
    if (focusTarget === null) return;
    const selector =
      focusTarget === "add"
        ? "[data-add-option]"
        : `[data-option-input="${focusTarget}"]`;
    panelRef.current?.querySelector<HTMLElement>(selector)?.focus();
    setFocusTarget(null);
  }, [focusTarget, updatedOptionList]);

  useEffect(() => {
    onStatusChange?.(optionClass, { count: activeCount, changeCount });
  }, [onStatusChange, optionClass, activeCount, changeCount]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleUpdateOption = (
    id: number,
    updates: { value: string } | { is_active: boolean },
  ) => {
    setUpdatedOptionList(
      updatedOptionList.map((option) =>
        option.id === id ? { ...option, ...updates } : option,
      ),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setUpdatedOptionList((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);
        return newItems.map((item, index) => ({
          ...item,
          display_order: index + 1,
        }));
      });
    }
  };

  const handleAddOption = () => {
    // Temporary ids are negative so they never collide with positive DB-assigned ids.
    const newId =
      Math.min(0, ...updatedOptionList.map((option) => option.id)) - 1;
    const newOption = {
      id: newId,
      value: "",
      display_order: updatedOptionList.length + 1,
      is_active: true,
      isNew: true,
    };
    setUpdatedOptionList([...updatedOptionList, newOption]);
  };

  const handleRemoveOption = async (id: number) => {
    // The removed row leaves the DOM with the focused button, so move focus to the next row's input (the add button for the last row).
    const displayed = updatedOptionList.filter((option) => option.is_active);
    const nextRow = displayed[displayed.findIndex((row) => row.id === id) + 1];
    setFocusTarget(nextRow ? nextRow.id : "add");
    setUpdatedOptionList(
      updatedOptionList.map((option) =>
        option.id === id ? { ...option, is_active: false } : option,
      ),
    );
  };

  // Deliberately no confirmation, same as "変更を破棄" in UserList.
  const handleDiscard = () => {
    setUpdatedOptionList(baseline);
    setShowErrors(false);
  };

  const handleSaveOption = async () => {
    try {
      setIsLoading(true);
      setShowErrors(true);
      for (const option of updatedOptionList) {
        if (!option.value && option.is_active) {
          notifyError("未入力の欄があります。");
          return;
        }
      }
      const duplicateValue = findDuplicateOptionValue(updatedOptionList);
      if (duplicateValue !== undefined) {
        notifyError(
          `「${duplicateValue}」が複数あります。項目名が重ならないようにしてください。`,
        );
        return;
      }

      const confirmed = await confirmAction(
        `${optionTitle}の項目を更新しますか？`,
      );
      if (!confirmed) return;

      // All rows at save time (edits continue while awaiting the response, so the baseline is built from this while the display only gets id replacement). Only changed and added rows are sent.
      const sentRows = updatedOptionList;
      const { insertedIds, updatedIds, error } = await bulkUpsertSelectOptions(
        optionClass,
        optionRowsToSave(baseline, sentRows),
      );
      // Replace saved added rows with DB ids (also on partial failure, so saving again does not re-add them).
      setUpdatedOptionList((prev) => applyInsertedOptionIds(prev, insertedIds));
      if (error) {
        console.error(`${optionTitle}情報の保存に失敗しました。`, error);
        const savedIds = updatedIds ?? [];
        const partiallySaved = hasPartiallySavedChanges(
          baseline,
          sentRows,
          insertedIds,
          savedIds,
        );
        if (insertedIds.length > 0 || savedIds.length > 0) {
          // Merge saved rows into the baseline (so reverting a saved change on screen still counts as unsaved).
          setBaseline((prev) =>
            baselineAfterPartialSave(prev, sentRows, insertedIds, savedIds),
          );
          // As on success, do not revert the display to the held pre-save props.
          syncedOptionListRef.current = latestOptionListRef.current;
          // Saved rows changed server-fetched props (e.g. team column of /dashboard/users), so refresh as on success.
          refreshPage();
        }
        notifyError(
          `${optionTitle}情報の保存に失敗しました。${error}${
            partiallySaved ? "一部の項目は保存済みです。" : ""
          }`,
        );
        return;
      }
      // Save-time content becomes the new baseline (no unsaved changes if nothing was edited while awaiting the response); added-then-deleted rows were not saved, so excluded.
      setBaseline(
        withoutDiscardedNewRows(applyInsertedOptionIds(sentRows, insertedIds)),
      );
      setUpdatedOptionList((prev) => withoutDiscardedNewRows(prev));
      setShowErrors(false);
      // Treat props held during editing (pre-save content) as synced so saved values do not flash back to pre-save content; apply from the next props.
      syncedOptionListRef.current = latestOptionListRef.current;
      notifySuccess(`${optionTitle}情報を更新しました。`);
      // Server-fetched options are passed as props (e.g. team column of /dashboard/users), so re-render Server Components and drop the client router cache to reflect the latest when switching screens.
      refreshPage();
    } catch (error) {
      console.error(`${optionTitle}情報の保存に失敗しました。`, error);
      notifyError(`${optionTitle}情報の保存に失敗しました。`);
    } finally {
      setIsLoading(false);
    }
  };

  const displayedRows = updatedOptionList.filter((option) => option.is_active);
  const duplicateValue = findDuplicateOptionValue(
    updatedOptionList.filter((row) => row.value),
  );
  const errorMessages = showErrors
    ? [
        ...(updatedOptionList.some((row) => row.is_active && !row.value)
          ? ["未入力の項目名があります。"]
          : []),
        ...(duplicateValue !== undefined
          ? [
              `「${duplicateValue}」が複数あります。項目名が重ならないようにしてください。`,
            ]
          : []),
      ]
    : [];

  const rowStatus = (option: OptionRow): OptionRowStatus | undefined => {
    if (option.isNew) return "added";
    const saved = baselineById.get(option.id);
    return saved && saved.value !== option.value ? "changed" : undefined;
  };

  const changeText = hasChanges
    ? `${changeCount} 件変更あり`
    : "変更はありません";
  const actionButtons = (
    <Group gap="xs">
      <Button
        type="button"
        variant="default"
        disabled={!hasChanges || isLoading}
        onClick={handleDiscard}
      >
        変更を破棄
      </Button>
      <Button
        type="button"
        color="green"
        // Disabled while there are no unsaved changes (repeated clicks while awaiting the refetch would re-register added rows).
        disabled={isLoading || !hasChanges}
        onClick={handleSaveOption}
      >
        保存
      </Button>
    </Group>
  );

  return (
    <Paper
      ref={panelRef}
      withBorder
      className={`relative p-4 ${hasChanges ? "pb-24 md:pb-4" : ""}`}
    >
      <Group justify="space-between" align="flex-start" className="pb-4">
        <div>
          <Group gap="xs">
            <Title order={2} size="h3">
              {optionTitle}
            </Title>
            <Badge variant="light" color="gray">
              {activeCount} 件
            </Badge>
          </Group>
          {optionDescription && (
            <Text size="sm" c="dimmed">
              {optionDescription}
            </Text>
          )}
        </div>
        {/* One element for both layouts (a JS breakpoint would mismatch SSR): a bottom bar shown only with changes on mobile, part of the header from md up. */}
        <div
          className={`${hasChanges ? "flex" : "hidden md:flex"} fixed inset-x-0 bottom-0 z-40 items-center justify-between gap-2 border-t border-gray-300 bg-white px-4 py-3 shadow-md md:static md:z-auto md:justify-end md:gap-4 md:border-0 md:bg-transparent md:p-0 md:shadow-none`}
        >
          <Text size="sm" c={hasChanges ? "orange.8" : "dimmed"} fw={500}>
            {changeText}
          </Text>
          {actionButtons}
        </div>
      </Group>
      {errorMessages.length > 0 && (
        <Alert color="red" title="入力内容を確認してください" className="mb-4">
          <ul className="list-disc pl-5">
            {errorMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="hidden w-10 text-center md:table-cell">
                順
              </Table.Th>
              <Table.Th className="w-8">
                <span className="sr-only">並び替え</span>
              </Table.Th>
              <Table.Th>項目名</Table.Th>
              <Table.Th className="w-12">
                <span className="sr-only">操作</span>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <SortableContext
              items={updatedOptionList}
              strategy={verticalListSortingStrategy}
            >
              {displayedRows.map((option, index) => (
                <SortableTableRow
                  key={option.id}
                  option={option}
                  label={optionTitle}
                  rowNumber={index + 1}
                  status={rowStatus(option)}
                  error={showErrors ? rowErrors.get(option.id) : undefined}
                  disabled={isLoading}
                  onUpdate={handleUpdateOption}
                  onRemove={handleRemoveOption}
                />
              ))}
            </SortableContext>
          </Table.Tbody>
        </Table>
        {displayedRows.length === 0 && (
          <Text size="sm" c="dimmed" className="py-4 text-center">
            まだ{optionTitle}がありません。下のボタンから追加してください。
          </Text>
        )}
        <Button
          type="button"
          fullWidth
          className="mt-4"
          color="dark"
          variant="outline"
          data-add-option
          onClick={handleAddOption}
          disabled={isLoading}
        >
          ＋ {optionTitle}を追加
        </Button>
        <Text size="xs" c="dimmed" className="pt-2">
          左端のつまみをドラッグすると並び順を変えられます
        </Text>
      </DndContext>
      <LoadingOverlay visible={isLoading || isRefreshPending} />
    </Paper>
  );
};

export default SelectOptionList;
