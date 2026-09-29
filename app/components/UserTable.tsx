import { Badge, Select, Table, TextInput } from "@mantine/core";
import { ProfilesType } from "../types/types";
import { UserValidationErrors } from "../utils/userList";
import { ROLES } from "@/app/utils/permissions";
import { teamOptionsFor } from "./UserList";

type Props = {
  userInfo: ProfilesType;
  teamList: string[];
  // Whether role/team/Slack ID changed since load (highlights the row).
  isChanged: boolean;
  // Validation errors before save (passed only after a save attempt).
  errors?: UserValidationErrors;
  disabled?: boolean;
  onUpdateUserList: (userId: number, updates: Partial<ProfilesType>) => void;
};

const UserTable = ({
  userInfo,
  teamList,
  isChanged,
  errors,
  disabled = false,
  onUpdateUserList,
}: Props) => {
  return (
    <Table.Tr
      key={userInfo.id}
      data-changed={isChanged || undefined}
      className={isChanged ? "bg-yellow-50" : undefined}
    >
      <Table.Td>
        <div className="flex items-center gap-2">
          <span>{userInfo.name}</span>
          {isChanged && (
            <Badge size="xs" color="orange" variant="light">
              変更あり
            </Badge>
          )}
        </div>
      </Table.Td>
      <Table.Td>{userInfo.email}</Table.Td>
      <Table.Td>
        <Select
          aria-label={`${userInfo.name}の権限`}
          data={ROLES}
          value={userInfo.class ?? null}
          onChange={(value) => onUpdateUserList(userInfo.id, { class: value })}
          placeholder="権限を選択"
          error={errors?.class}
          disabled={disabled}
        />
      </Table.Td>
      <Table.Td>
        <Select
          aria-label={`${userInfo.name}のチーム`}
          data={teamOptionsFor(userInfo.team, teamList)}
          value={userInfo.team ?? null}
          onChange={(value) => onUpdateUserList(userInfo.id, { team: value })}
          placeholder={"チームを選択"}
          size="xs"
          error={errors?.team}
          disabled={disabled}
        />
      </Table.Td>
      <Table.Td>
        <TextInput
          aria-label={`${userInfo.name}の Slack ID`}
          value={userInfo.slack_id || ""}
          onChange={(e) =>
            onUpdateUserList(userInfo.id, {
              slack_id: e.currentTarget.value,
            })
          }
          size="xs"
          disabled={disabled}
        />
      </Table.Td>
    </Table.Tr>
  );
};

export default UserTable;
