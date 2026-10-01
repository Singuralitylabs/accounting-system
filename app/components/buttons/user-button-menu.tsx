"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, Menu, UnstyledButton } from "@mantine/core";

type UserButtonMenuProps = {
  userName?: string | null;
  userEmail?: string | null;
  userImage?: string | null;
  onSignOut: () => Promise<void>;
  signingOut?: boolean;
};

const UserButtonMenu = ({
  userName,
  userEmail,
  userImage,
  onSignOut,
  signingOut = false,
}: UserButtonMenuProps) => {
  const displayName = userName || userEmail || undefined;
  const initial = displayName ? Array.from(displayName)[0].toUpperCase() : "?";
  const avatarRef = useRef<HTMLDivElement>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
    // An SSR-rendered img may finish loading or fail before hydration (before React attaches onError), which Avatar's onError misses. Check after hydration whether it already failed (failures after hydration are handled by Avatar's onError).
    const img = avatarRef.current?.querySelector("img");
    if (img?.complete && img.naturalWidth === 0) {
      setImageFailed(true);
    }
  }, [userImage]);

  return (
    <Menu shadow="md" width={220} position="bottom-end" withArrow>
      <Menu.Target>
        <UnstyledButton
          aria-label={
            displayName
              ? `ユーザーメニュー（${displayName}）`
              : "ユーザーメニュー"
          }
        >
          <Avatar
            ref={avatarRef}
            src={imageFailed ? null : userImage}
            alt={displayName || ""}
            radius="xl"
            size={32}
          >
            {initial}
          </Avatar>
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>
          <div>{displayName}</div>
          {userName && userEmail && userEmail !== userName && (
            <div>{userEmail}</div>
          )}
        </Menu.Label>
        <Menu.Divider />
        <Menu.Item disabled={signingOut} onClick={onSignOut}>
          ログアウト
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};

export default UserButtonMenu;
