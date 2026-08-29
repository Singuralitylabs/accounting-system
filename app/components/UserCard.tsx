import { Button, Select, Stack, Text, TextInput } from "@mantine/core";
import { ProfilesType } from "../types/types";
import { classList } from "./UserList";
import { useEffect, useState } from "react";
import { getSelectOptions } from "../utils/supabase/selectOptions";

type Props = {
  userInfo: ProfilesType;
  onUpdateUserList: (userId: number, updates: Partial<ProfilesType>) => void;
  onSaveUser: (userId: number) => void;
};

const UserCard = ({ userInfo, onUpdateUserList, onSaveUser }: Props) => {
  const [teamOptions, setTeamOptions] = useState<string[]>([]);

  useEffect(() => {
    const fetchTeamOptions = async () => {
      const { options } = await getSelectOptions("team");
      if (options) {
        setTeamOptions(options.map((option) => option.value));
      }
    };
    fetchTeamOptions();
  }, []);

  return (
    <div className="py-4 border-b border-gray-200">
      <Stack>
        <div className="flex gap-8">
          <div>
            <Text size="sm" fw={500} c="dimmed">
              ユーザーID
            </Text>
            <Text>{userInfo.id}</Text>
          </div>

          <div>
            <Text size="sm" fw={500} c="dimmed">
              名前
            </Text>
            <Text>{userInfo.name}</Text>
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
            data={classList}
            value={userInfo.class || ""}
            onChange={(value) => {
              const updates: Partial<ProfilesType> = { class: value };
              onUpdateUserList(userInfo.id, updates);
            }}
            className="mt-1"
          />
        </div>

        <div>
          <Text size="sm" fw={500} c="dimmed">
            チーム
          </Text>
          <Select
            data={teamOptions}
            value={userInfo.team || ""}
            onChange={(value) => onUpdateUserList(userInfo.id, { team: value })}
            placeholder={"チームを選択"}
            size="xs"
            className="mt-1"
          />
        </div>

        <div>
          <Text size="sm" fw={500} c="dimmed">
            Slack ID
          </Text>
          <TextInput
            value={userInfo.slack_id || ""}
            onChange={(e) =>
              onUpdateUserList(userInfo.id, { slack_id: e.currentTarget.value })
            }
            size="xs"
            className="mt-1"
          />
        </div>

        <Button
          color="green"
          onClick={() => onSaveUser(userInfo.id)}
          className="mt-2"
        >
          保存
        </Button>
      </Stack>
    </div>
  );
};

export default UserCard;
