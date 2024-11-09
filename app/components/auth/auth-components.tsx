"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";

export const SignIn = () => {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const handleSignIn = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        router.push("/");
        return;
      }

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
        throw error;
      }
    } catch (error) {
      console.error("ログイン処理でエラーが発生しました:", error);
    }
  };

  return <button onClick={handleSignIn}>Google認証</button>;
};
