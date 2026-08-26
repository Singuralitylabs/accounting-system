"use client";

import { useEffect, useState } from "react";
import { FcGoogle } from "react-icons/fc";
import {
  ALLOWED_EMAIL_DOMAIN,
  isAllowedEmailDomain,
} from "@/app/utils/constants";
import { useRouter } from "next/navigation";
import { useSupabase } from "@/app/components/providers/SupabaseProvider";
import { notifyError } from "@/app/utils/notify";
import { authPrimaryButtonClassName } from "./authButtonStyles";

export const SignIn = () => {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      // クロスオリジンの OAuth 画面から「戻る」と bfcache で state が残るため、
      // スピナー付き disabled のまま固まらないよう loading を解除する。
      if (event.persisted) {
        setLoading(false);
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const handleSignIn = async () => {
    if (loading) {
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // 既存ユーザーがいる場合のドメインチェック（UX 用の早期判定。
        // 実際の強制はサーバの /auth/callback で行う）
        if (!isAllowedEmailDomain(user.email)) {
          await supabase.auth.signOut();
          notifyError(
            `${ALLOWED_EMAIL_DOMAIN}のメールアドレスのみログイン可能です。`,
          );
          setLoading(false);
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
      notifyError("ログイン処理でエラーが発生しました。");
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void handleSignIn();
      }}
      disabled={loading}
      aria-busy={loading}
      className={authPrimaryButtonClassName}
    >
      {loading ? (
        <span
          className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
          aria-hidden
        />
      ) : (
        <FcGoogle className="h-6 w-6" aria-hidden />
      )}
      Google でログイン
    </button>
  );
};
