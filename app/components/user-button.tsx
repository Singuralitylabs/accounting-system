"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useEffect, useState } from "react";
import UserButtonMenu from "./user-buttonMenu";
import { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

const UserButton = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    };

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
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
