"use client";

import { Table, Title, LoadingOverlay } from "@mantine/core";
import { ProfilesType } from "../types/types";
import { useState } from "react";
import updateProfile from "../utils/supabase/updateProfile";
import { notifyError, notifySuccess, toErrorMessage } from "../utils/notify";
import { useViewportSize } from "@mantine/hooks";
import UserCard from "./UserCard";
import UserTable from "./UserTable";

const elementListOfUser = [
  "ID",
  "名前",
  "メールアドレス",
  "権限",
  "チーム",
  "slack ID",
];
export const classList = ["public", "teamleader", "accounting", "admin"];

type Props = {
  userList: ProfilesType[];
  // チームの選択肢。サーバ側（DynamicDashboard）で取得済みのものを受け取る。
  // 行ごとにクライアントから取得すると、行数分の Server Action が直列に走り
  // チーム欄だけ表示が遅れるため（Select は value が data に無いと空表示になる）。
  teamList: string[];
};

const UserList = ({ userList, teamList }: Props) => {
  const [updatedUserList, setUpdatedUserList] =
    useState<ProfilesType[]>(userList);
  const [isLoading, setIsLoading] = useState(false);

  const { width } = useViewportSize();
  const isMobile = width < 768;

  const handleUpdateUserList = (
    userId: number,
    updates: Partial<ProfilesType>,
  ) => {
    setUpdatedUserList(
      updatedUserList.map((user) =>
        user.id === userId ? { ...user, ...updates } : user,
      ),
    );
  };

  const handleSave = async (userId: number) => {
    setIsLoading(true);
    try {
      const user = updatedUserList.find((user) => user.id === userId);
      if (!user) {
        return;
      }
      await updateProfile({ profile: user });
      notifySuccess("ユーザー情報を保存しました。");
    } catch (error) {
      console.error("ユーザー情報の保存に失敗しました:", error);
      notifyError(toErrorMessage(error, "ユーザー情報の保存に失敗しました。"));
    } finally {
      setIsLoading(false);
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
    <div className="relative p-4">
      <Title order={2} className="pb-4">
        ユーザーリスト
      </Title>
      {!isMobile ? (
        <Table>
          <Table.Thead>{tableHeads}</Table.Thead>
          <Table.Tbody>
            {updatedUserList.map((user) => (
              <UserTable
                key={user.id}
                userInfo={user}
                teamList={teamList}
                onUpdateUserList={handleUpdateUserList}
                onSaveUser={handleSave}
              />
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        updatedUserList.map((user) => (
          <UserCard
            key={user.id}
            userInfo={user}
            teamList={teamList}
            onUpdateUserList={handleUpdateUserList}
            onSaveUser={handleSave}
          />
        ))
      )}
      <LoadingOverlay visible={isLoading} />
    </div>
  );
};

export default UserList;
