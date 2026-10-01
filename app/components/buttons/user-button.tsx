"use client";

import UserButtonMenu from "./user-button-menu";
import { User } from "@supabase/supabase-js";

type UserButtonProps = {
  user: User;
  onSignOut: () => Promise<void>;
  signingOut?: boolean;
};

const UserButton = ({
  user,
  onSignOut,
  signingOut = false,
}: UserButtonProps) => {
  return (
    <UserButtonMenu
      userName={user.user_metadata?.name}
      userEmail={user.email}
      userImage={user.user_metadata?.avatar_url}
      onSignOut={onSignOut}
      signingOut={signingOut}
    />
  );
};

export default UserButton;
