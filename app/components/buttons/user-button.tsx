"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useEffect, useState } from "react";
import UserButtonMenu from "./user-buttonMenu";
import { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { ALLOWED_EMAIL_DOMAIN } from "@/app/utils/constants";

const UserButton = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    const getUserData = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser ?? null);
      setLoading(false);
    };

    getUserData();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        // セッションがある場合は、getUser()で再検証
        const {
          data: { user: validatedUser },
        } = await supabase.auth.getUser();
        setUser(validatedUser ?? null);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  if (loading) {
    return <div>Loading...</div>;
  }

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

  const handleSignOut = async () => {
    await supabase.auth.signOut();

    router.push("/login");
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
          onSignOut={handleSignOut}
        />
      )}
    </div>
  );
};

export default UserButton;
