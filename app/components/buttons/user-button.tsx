"use client";

import UserButtonMenu from "./user-buttonMenu";
import { User } from "@supabase/supabase-js";
import { ALLOWED_EMAIL_DOMAIN } from "@/app/utils/constants";
import { useSupabase } from "@/app/components/providers/SupabaseProvider";

type UserButtonProps = {
  user: User | null;
  onSignOut: () => Promise<void>;
};

const UserButton = ({ user, onSignOut }: UserButtonProps) => {
  const { supabase } = useSupabase();

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Google 側でも組織ドメインのアカウント選択に絞る（UX 改善）。
        // セキュリティ上の強制はサーバ側コールバックが担う。
        queryParams: {
          hd: ALLOWED_EMAIL_DOMAIN,
        },
      },
    });
    if (error) {
      console.error("Error signing in:", error.message);
    }
  };

  return (
    <div>
      {!user ? (
        <button
          onClick={handleSignIn}
          className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
        >
          ログイン
        </button>
      ) : (
        <UserButtonMenu
          userName={user.user_metadata?.name || user.email}
          userImage={user.user_metadata?.avatar_url}
          onSignOut={onSignOut}
        />
      )}
    </div>
  );
};

export default UserButton;
