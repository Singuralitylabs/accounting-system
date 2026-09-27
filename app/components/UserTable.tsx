import { Button, Group, Select, Table, TextInput } from "@mantine/core";
import { ProfilesType } from "../types/types";
import { classList, teamOptionsFor } from "./UserList";

type Props = {
  userInfo: ProfilesType;
  teamList: string[];
  onUpdateUserList: (userId: number, updates: Partial<ProfilesType>) => void;
  onSaveUser: (userId: number) => void;
};

const UserTable = ({
  userInfo,
  teamList,
  onUpdateUserList,
  onSaveUser,
}: Props) => {
  return (
    <Table.Tr key={userInfo.id}>
      <Table.Td>{userInfo.id}</Table.Td>
      <Table.Td>{userInfo.name}</Table.Td>
      <Table.Td>{userInfo.email}</Table.Td>
      <Table.Td>
        <Select
          data={classList}
          value={userInfo.class || ""}
          onChange={(value) => {
            // teamleader以外に変更時はteamをnullに
            const updates: Partial<ProfilesType> = { class: value };
            if (value !== "teamleader") {
              updates.team = null;
            }
            onUpdateUserList(userInfo.id, updates);
          }}
        />
      </Table.Td>
      <Table.Td>
        <Select
          data={teamOptionsFor(userInfo.team, teamList)}
          value={userInfo.team || ""}
          onChange={(value) => onUpdateUserList(userInfo.id, { team: value })}
          placeholder={"チームを選択"}
          size="xs"
        />
      </Table.Td>
      <Table.Td>
        <TextInput
          value={userInfo.slack_id || ""}
          onChange={(e) =>
            onUpdateUserList(userInfo.id, {
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
            onClick={() => onSaveUser(userInfo.id)}
          >
            保存
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
};

export default UserTable;
