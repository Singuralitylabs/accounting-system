"use client";

import { useEffect, useRef, useState } from "react";
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
  const avatarRef = useRef<HTMLDivElement>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
    // SSR で描画された img はハイドレート前（React が onError を
    // アタッチする前）に読み込みが完了/失敗している場合があり、
    // その場合 Avatar 標準の onError では失敗を検知できない。
    // ハイドレート後に既に失敗済みかどうかを確認する。
    const img = avatarRef.current?.querySelector("img");
    if (img?.complete && img.naturalWidth === 0) {
      setImageFailed(true);
    }
  }, [userImage]);

  return (
    <Menu shadow="md" width={220} position="bottom-end" withArrow>
      <Menu.Target>
        <UnstyledButton aria-label="ユーザーメニュー">
          <Avatar
            ref={avatarRef}
            src={imageFailed ? null : userImage}
            alt={userName || ""}
            radius="xl"
            size={32}
            imageProps={{ onError: () => setImageFailed(true) }}
          >
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
