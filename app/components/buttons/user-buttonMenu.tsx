"use client";

import { Avatar, Menu, UnstyledButton } from "@mantine/core";

type UserButtonMenuProps = {
  userName?: string | null;
  userEmail?: string | null;
  userImage?: string | null;
  onSignOut: () => Promise<void>;
};

const UserButtonMenu = ({
  userName,
  userEmail,
  userImage,
  onSignOut,
}: UserButtonMenuProps) => {
  const initial = userName ? userName.charAt(0).toUpperCase() : "?";

  return (
    <Menu shadow="md" width={220} position="bottom-end" withArrow>
      <Menu.Target>
        <UnstyledButton aria-label="ユーザーメニュー">
          <Avatar src={userImage} alt={userName || ""} radius="xl" size={32}>
            {initial}
          </Avatar>
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>
          <div>{userName}</div>
          {userEmail && userEmail !== userName && <div>{userEmail}</div>}
        </Menu.Label>
        <Menu.Divider />
        <Menu.Item onClick={onSignOut}>ログアウト</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};

export default UserButtonMenu;
