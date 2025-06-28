"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ALLOWED_DOMAIN = "future-tech-association.org";

const isAllowedDomain = (email: string): boolean => {
  return email.endsWith(`@${ALLOWED_DOMAIN}`);
};

export const SignIn = () => {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const handleSignIn = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // 既存ユーザーがいる場合のドメインチェック
        if (user.email && !isAllowedDomain(user.email)) {
          await supabase.auth.signOut();
          alert(`${ALLOWED_DOMAIN}のメールアドレスのみログイン可能です。`);
          return;
        }
        router.push("/");
        return;
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        console.error("認証エラー:", error.message);
        throw error;
      }
    } catch (error) {
      console.error("ログイン処理でエラーが発生しました:", error);
      alert("ログイン処理でエラーが発生しました。");
    }
  };

  const checkDomainAfterRedirect = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email && !isAllowedDomain(user.email)) {
      await supabase.auth.signOut();
      alert(`${ALLOWED_DOMAIN}のメールアドレスのみログイン可能です。`);
      router.push("/");
    }
  };

  useEffect(() => {
    if (window.location.pathname === "/auth/callback") {
      checkDomainAfterRedirect();
    }
  }, []);

  return (
    <button 
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleSignIn();
      }}
      className="flex justify-center h-12 items-center bg-blue-600 text-lg rounded text-white w-32 text-center my-4 hover:cursor-pointer hover:bg-blue-300"
    >
      Google認証
    </button>
  );
};
