"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export const SignIn = () => {
  const supabase = createClientComponentClient();

  const handleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) {
        console.error("認証エラー:", error.message);
      }
    } catch (error) {
      console.error("ログイン処理でエラーが発生しました:", error);
    }
  };

  return <button onClick={handleSignIn}>Google認証</button>;
};
