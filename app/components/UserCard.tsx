import { Badge, Select, Stack, Text, TextInput } from "@mantine/core";
import { ProfilesType } from "../types/types";
import { UserValidationErrors } from "../utils/userList";
import { ROLE_SELECT_OPTIONS } from "@/app/utils/permissions";
import { CHANGED_ROW_MARK_COLOR } from "../utils/userListGroup";
import { teamOptionsFor } from "./UserList";

type Props = {
  userInfo: ProfilesType;
  teamList: string[];
  // Whether role/team/Slack ID changed since load (highlights the card).
  isChanged: boolean;
  // Card background by team (undefined = no color).
  teamColor?: string;
  // Validation errors before save (passed only after a save attempt).
  errors?: UserValidationErrors;
  disabled?: boolean;
  onUpdateUserList: (userId: number, updates: Partial<ProfilesType>) => void;
};

const UserCard = ({
  userInfo,
  teamList,
  isChanged,
  teamColor,
  errors,
  disabled = false,
  onUpdateUserList,
}: Props) => {
  return (
    <div
      data-changed={isChanged || undefined}
      className="py-4 pl-3 border-b border-gray-200 border-l-4"
      style={{
        backgroundColor: teamColor,
        borderLeftColor: isChanged ? CHANGED_ROW_MARK_COLOR : "transparent",
      }}
    >
      <Stack>
        <div>
          <Text size="sm" fw={500} c="dimmed">
            名前
          </Text>
          <div className="flex items-center gap-2">
            <Text>{userInfo.name}</Text>
            {isChanged && (
              <Badge size="xs" color="orange" variant="light">
                変更あり
              </Badge>
            )}
          </div>
        </div>

        <div>
          <Text size="sm" fw={500} c="dimmed">
            メールアドレス
          </Text>
          <Text>{userInfo.email}</Text>
        </div>

        <div>
          <Text size="sm" fw={500} c="dimmed">
            権限
          </Text>
          <Select
            aria-label={`${userInfo.name}の権限`}
            data={ROLE_SELECT_OPTIONS}
            value={userInfo.class ?? null}
            onChange={(value) =>
              onUpdateUserList(userInfo.id, { class: value })
            }
            placeholder="権限を選択"
            error={errors?.class}
            disabled={disabled}
            className="mt-1"
          />
        </div>

        <div>
          <Text size="sm" fw={500} c="dimmed">
            チーム
          </Text>
          <Select
            aria-label={`${userInfo.name}のチーム`}
            data={teamOptionsFor(userInfo.team, teamList)}
            value={userInfo.team ?? null}
            onChange={(value) => onUpdateUserList(userInfo.id, { team: value })}
            placeholder={"チームを選択"}
            size="xs"
            error={errors?.team}
            disabled={disabled}
            className="mt-1"
          />
        </div>

        <div>
          <Text size="sm" fw={500} c="dimmed">
            Slack ID
          </Text>
          <TextInput
            aria-label={`${userInfo.name}の Slack ID`}
            value={userInfo.slack_id || ""}
            onChange={(e) =>
              onUpdateUserList(userInfo.id, { slack_id: e.currentTarget.value })
            }
            size="xs"
            disabled={disabled}
            className="mt-1"
          />
        </div>
      </Stack>
    </div>
  );
};

export default UserCard;
