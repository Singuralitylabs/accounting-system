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
      ? "カテゴリ"
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
    const newOption = {
      id: updatedOptionList.length + 1,
      value: "",
      display_order: updatedOptionList.length + 1,
      is_active: true,
      isNew: true,
    };
    setUpdatedOptionList([...updatedOptionList, newOption]);
  };

  const handleRemoveOption = async (id: number) => {
    try {
      const targetOption = updatedOptionList.find((option) => option.id === id);
      const confirm = window.confirm(`${targetOption?.value}を削除しますか？`);
      if (!confirm) return;

      setUpdatedOptionList(
        updatedOptionList.map((option) =>
          option.id === id ? { ...option, is_active: false } : option
        )
      );

      await updateSelectOption(
        id,
        targetOption?.value || "",
        targetOption?.display_order || 0,
        false
      );
    } catch (error) {
      console.error(`${optionTitle}情報の削除に失敗しました。`, error);
    }
  };

  const handleSaveOption = async (id: number) => {
    try {
      const targetOption = updatedOptionList.find((option) => option.id === id);
      if (!targetOption?.value) {
        alert("値を入力してください。");
        return;
      }

      if (targetOption?.isNew) {
        await insertSelectOption(
          optionClass,
          targetOption?.value,
          targetOption?.display_order || updatedOptionList.length
        );
      } else {
        await updateSelectOption(
          id,
          targetOption?.value,
          targetOption?.display_order || updatedOptionList.length,
          targetOption?.is_active || true
        );
      }

      const otherOptions = updatedOptionList.filter(
        (opt) => opt.id !== id && !opt.isNew
      );

      await Promise.all(
        otherOptions.map((option) =>
          updateSelectOption(
            option.id,
            option.value,
            option.display_order || 0,
            option.is_active || true
          )
        )
      );
    } catch (error) {
      console.error(`${optionTitle}情報の保存に失敗しました。`, error);
    }
  };

  return (
    <div className="p-4 border-collapse border border-gray-500 bg-slate-50 rounded">
      <Title order={3} className="pb-4">
        {optionTitle}
      </Title>
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
                    onSave={handleSaveOption}
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
