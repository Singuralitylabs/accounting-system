"use client";

import { Table, Title, TextInput, Button, Group, Select } from "@mantine/core";
import { ProfilesType } from "../types/types";
import { classList, elementListOfUser } from "../types/params";
import { useState } from "react";
import updateProfile from "../utils/updateProfile";

const UserList = ({ userList }: { userList: ProfilesType[] }) => {
  const [updatedUserList, setUpdatedUserList] =
    useState<ProfilesType[]>(userList);

  const handleUpdateUserList = (
    userId: number,
    updates: Partial<ProfilesType>
  ) => {
    setUpdatedUserList(
      updatedUserList.map((user) =>
        user.id === userId ? { ...user, ...updates } : user
      )
    );
  };

  const handleSave = async (userId: number) => {
    try {
      const user = updatedUserList.find((user) => user.id === userId);
      if (!user) {
        return;
      }
      await updateProfile({ profile: user });
    } catch (error) {
      console.error("ユーザー情報の保存に失敗しました:", error);
    }
  };

  const tableHeads = (
    <Table.Tr key={elementListOfUser[0]}>
      {elementListOfUser.map((element, index) => (
        <Table.Th key={index} className="whitespace-nowrap px-4 text-center">
          {element}
        </Table.Th>
      ))}
    </Table.Tr>
  );

  return (
    <div>
      <Title order={2} className="pb-4">
        ユーザーリスト
      </Title>
      <Table>
        <Table.Thead>{tableHeads}</Table.Thead>
        <Table.Tbody>
          {updatedUserList.map((user) => (
            <Table.Tr key={user.id}>
              <Table.Td>{user.id}</Table.Td>
              <Table.Td>{user.name}</Table.Td>
              <Table.Td>{user.email}</Table.Td>
              <Table.Td>
                <Select
                  data={classList}
                  value={user.class || ""}
                  onChange={(value) =>
                    handleUpdateUserList(user.id, { class: value })
                  }
                />
              </Table.Td>
              <Table.Td>
                <TextInput
                  value={user.slack_id || ""}
                  onChange={(e) =>
                    handleUpdateUserList(user.id, {
                      slack_id: e.currentTarget.value,
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
                    onClick={() => handleSave(user.id)}
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

export default UserList;
