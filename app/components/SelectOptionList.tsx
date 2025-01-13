"use client";

import {
  Table,
  Title,
  TextInput,
  Button,
  Group,
  Checkbox,
} from "@mantine/core";
import { SelectOptionType } from "../types/types";
import { useState } from "react";
import { updateSelectOption } from "../utils/supabaseServer";

const SelectOptionList = ({
  optionTitle,
  optionList,
}: {
  optionTitle: string;
  optionList: Pick<
    SelectOptionType,
    "id" | "value" | "display_order" | "is_active"
  >[];
}) => {
  const [updatedOptionList, setUpdatedOptionList] =
    useState<
      Pick<SelectOptionType, "id" | "value" | "display_order" | "is_active">[]
    >(optionList);

  const itemList = ["ID", "値", "表示順", "表示", ""];

  const handleUpdateTeamList = (
    id: number,
    updates:
      | { value: string }
      | { display_order: number }
      | { is_active: boolean }
  ) => {
    setUpdatedOptionList(
      updatedOptionList.map((option) =>
        option.id === id ? { ...option, ...updates } : option
      )
    );
  };

  const handleSave = async (id: number) => {
    try {
      const option = updatedOptionList.find((option) => option.id === id);
      if (!option) {
        return;
      }
      await updateSelectOption(
        id,
        option.value,
        option.display_order || 0,
        option.is_active || true
      );
    } catch (error) {
      console.error("チーム情報の更新に失敗しました:", error);
    }
  };

  const tableHeads = (
    <Table.Tr key={itemList[0]}>
      {itemList.map((item, index) => (
        <Table.Th key={index} className="whitespace-nowrap px-4 text-center">
          {item}
        </Table.Th>
      ))}
    </Table.Tr>
  );

  return (
    <div className="p-4">
      <Title order={2} className="pb-4">
        {optionTitle}
      </Title>
      <Table>
        <Table.Thead>{tableHeads}</Table.Thead>
        <Table.Tbody>
          {updatedOptionList.map((option) => (
            <Table.Tr key={option.id}>
              <Table.Td>{option.id}</Table.Td>
              <Table.Td>
                <TextInput
                  value={option.value || ""}
                  onChange={(e) =>
                    handleUpdateTeamList(option.id, {
                      value: e.currentTarget.value,
                    })
                  }
                  size="xs"
                />
              </Table.Td>
              <Table.Td>{option.display_order}</Table.Td>
              <Table.Td>
                <Checkbox
                  value={option.is_active ? "表示" : "非表示"}
                  onChange={(e) =>
                    handleUpdateTeamList(option.id, {
                      is_active: e.currentTarget.value === "表示",
                    })
                  }
                  size="xs"
                />
              </Table.Td>
              <Table.Td>
                <Group justify="center">
                  <Button
                    size="xs"
                    color="green"
                    onClick={() => handleSave(option.id)}
                  >
                    保存
                  </Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
};

export default SelectOptionList;
