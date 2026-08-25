"use client";

import { Button, LoadingOverlay, Table, Title } from "@mantine/core";
import { SelectOptionType } from "../types/types";
import { useState } from "react";
import { bulkUpsertSelectOptions } from "../utils/supabase/selectOptions";
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
  const [updatedOptionList, setUpdatedOptionList] = useState<
    (Pick<SelectOptionType, "id" | "value" | "display_order" | "is_active"> & {
      isNew: boolean;
    })[]
  >(optionList.map((option) => ({ ...option, isNew: false })));
  const [isLoading, setIsLoading] = useState(false);

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
    const newId = Math.max(...updatedOptionList.map((option) => option.id)) + 1;
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

      const confirmed = await confirmAction(
        `${optionTitle}の項目を更新しますか？`,
      );
      if (!confirmed) return;

      await bulkUpsertSelectOptions(optionClass, updatedOptionList);
      notifySuccess(`${optionTitle}情報を更新しました。`);
    } catch (error) {
      console.error(`${optionTitle}情報の保存に失敗しました。`, error);
      notifyError(`${optionTitle}情報の保存に失敗しました。`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 border-collapse border border-gray-500 bg-slate-50 rounded">
      <div className="flex justify-between items-center">
        <Title order={3} className="pb-4">
          {optionTitle}
        </Title>
        <Button type="button" disabled={isLoading} onClick={handleSaveOption}>
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
