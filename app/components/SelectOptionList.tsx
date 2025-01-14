"use client";

import { Button, Table, Title } from "@mantine/core";
import { SelectOptionType } from "../types/types";
import { useState } from "react";
import {
  insertSelectOption,
  updateSelectOption,
} from "../utils/supabaseServer";
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

  const optionTitle =
    optionClass === "team"
      ? "チーム"
      : optionClass === "category"
      ? "分類"
      : "品目";

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleUpdateTeamList = (
    id: number,
    updates: { value: string } | { is_active: boolean }
  ) => {
    setUpdatedOptionList(
      updatedOptionList.map((option) =>
        option.id === id ? { ...option, ...updates } : option
      )
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
        option.id === id ? { ...option, is_active: false } : option
      )
    );
  };

  const handleSaveOption = async () => {
    try {
      for (const option of updatedOptionList) {
        if (!option.value && option.is_active) {
          alert("未入力の欄があります。");
          return;
        }
      }

      const confirm = window.confirm(`${optionTitle}の項目を更新しますか？`);
      if (!confirm) return;

      for (const option of updatedOptionList) {
        if (option.isNew && !option.is_active) continue;
        if (option.isNew) {
          await insertSelectOption(
            optionClass,
            option.value,
            option.display_order || updatedOptionList.length
          );
        } else {
          await updateSelectOption(
            option.id,
            option.value,
            option.display_order || updatedOptionList.length,
            option.is_active!
          );
        }
      }
    } catch (error) {
      console.error(`${optionTitle}情報の保存に失敗しました。`, error);
    }
  };

  return (
    <div className="p-4 border-collapse border border-gray-500 bg-slate-50 rounded">
      <div className="flex justify-between items-center">
        <Title order={3} className="pb-4">
          {optionTitle}
        </Title>
        <Button type="button" onClick={handleSaveOption}>
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
    </div>
  );
};

export default SelectOptionList;
