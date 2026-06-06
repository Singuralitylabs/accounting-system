"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  ALLOWED_EMAIL_DOMAIN,
  isAllowedEmailDomain,
} from "@/app/utils/constants";
import { useRouter } from "next/navigation";

export const SignIn = () => {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const handleSignIn = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // 既存ユーザーがいる場合のドメインチェック（UX 用の早期判定。
        // 実際の強制はサーバの /auth/callback で行う）
        if (!isAllowedEmailDomain(user.email)) {
          await supabase.auth.signOut();
          alert(
            `${ALLOWED_EMAIL_DOMAIN}のメールアドレスのみログイン可能です。`,
          );
          return;
        }
        router.push("/");
        return;
      }

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
        console.error("認証エラー:", error.message);
        throw error;
      }
    } catch (error) {
      console.error("ログイン処理でエラーが発生しました:", error);
      alert("ログイン処理でエラーが発生しました。");
    }
  };

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
