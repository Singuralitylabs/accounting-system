"use client";

import UserButtonMenu from "./user-buttonMenu";
import { User } from "@supabase/supabase-js";

type UserButtonProps = {
  user: User;
  onSignOut: () => Promise<void>;
};

const UserButton = ({ user, onSignOut }: UserButtonProps) => {
  return (
    <UserButtonMenu
      userName={user.user_metadata?.name || user.email}
      userEmail={user.email}
      userImage={user.user_metadata?.avatar_url}
      onSignOut={onSignOut}
    />
  );
};

export default UserButton;
