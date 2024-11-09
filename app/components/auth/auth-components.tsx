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
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        // 既存セッションがある場合のドメインチェック
        if (session.user.email && !isAllowedDomain(session.user.email)) {
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
          queryParams: {
            access_type: "offline",
            prompt: "consent",
            // Googleのログインで表示するドメインを制限
            // ただし、これはUIの制限であり、完全な制限ではありません
            hd: ALLOWED_DOMAIN,
          },
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
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user.email && !isAllowedDomain(session.user.email)) {
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

  return <button onClick={handleSignIn}>Google認証</button>;
};
