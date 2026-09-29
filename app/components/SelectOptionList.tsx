"use client";

import { Button, LoadingOverlay, Table, Title } from "@mantine/core";
import { SelectOptionType } from "../types/types";
import { useEffect, useRef, useState } from "react";
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
import { SortableTableRow } from "./SortableTableRow";
import { CiSquarePlus } from "react-icons/ci";
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

const SelectOptionList = ({
  optionClass,
  optionList,
}: {
  optionClass: string;
  optionList: Pick<
    SelectOptionType,
    "id" | "value" | "display_order" | "is_active"
  >[];
}) => {
  const [updatedOptionList, setUpdatedOptionList] = useState<OptionRow[]>(() =>
    toOptionRows(optionList),
  );
  // State when loaded (or at the last successful save); compared to detect unsaved changes, reported to DashboardNav for the confirm before switching.
  const [baseline, setBaseline] = useState<OptionRow[]>(() =>
    toOptionRows(optionList),
  );
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const hasChanges = hasOptionListChanges(baseline, updatedOptionList);
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

  const OPTION_TITLES: Record<string, string> = {
    team: "チーム",
    category: "分類",
    item: "品目",
    extra_income_category: "収入分類",
    extra_expense_category: "支出分類",
    payment_method: "決済方法",
  };
  const optionTitle = OPTION_TITLES[optionClass] ?? optionClass;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleUpdateTeamList = (
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
    setUpdatedOptionList(
      updatedOptionList.map((option) =>
        option.id === id ? { ...option, is_active: false } : option,
      ),
    );
  };

  const handleSaveOption = async () => {
    try {
      setIsLoading(true);
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
      // Treat props held during editing (pre-save content) as synced so saved values do not flash back to pre-save content; apply from the next props.
      syncedOptionListRef.current = latestOptionListRef.current;
      notifySuccess(`${optionTitle}情報を更新しました。`);
      // Server-fetched options are passed as props (e.g. team column of /dashboard/users), so re-render Server Components and drop the client router cache to reflect the latest when switching screens.
      router.refresh();
    } catch (error) {
      console.error(`${optionTitle}情報の保存に失敗しました。`, error);
      notifyError(`${optionTitle}情報の保存に失敗しました。`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative p-4 border-collapse border border-gray-500 bg-slate-50 rounded">
      <div className="flex justify-between items-center">
        <Title order={3} className="pb-4">
          {optionTitle}
        </Title>
        <Button
          type="button"
          // Disabled while there are no unsaved changes (repeated clicks while awaiting the refetch would re-register added rows).
          disabled={isLoading || !hasChanges}
          onClick={handleSaveOption}
        >
          更新
        </Button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <Table>
          <Table.Tbody>
            <SortableContext
              items={updatedOptionList}
              strategy={verticalListSortingStrategy}
            >
              {updatedOptionList
                .filter((option) => option.is_active)
                .map((option) => (
                  <SortableTableRow
                    key={option.id}
                    option={option}
                    onUpdate={handleUpdateTeamList}
                    onRemove={handleRemoveOption}
                  />
                ))}
            </SortableContext>
          </Table.Tbody>
        </Table>
        <Button
          type="button"
          fullWidth
          className="mt-4"
          color="dark"
          variant="outline"
          rightSection={<CiSquarePlus />}
          onClick={handleAddOption}
        >
          {optionTitle}追加
        </Button>
      </DndContext>
      <LoadingOverlay visible={isLoading} />
    </div>
  );
};

export default SelectOptionList;
