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
import { Loader } from "@mantine/core";
import { authPrimaryButtonClassName } from "./authButtonStyles";

export const SignIn = () => {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      // Cross-origin OAuth pages can be left with "back" (bfcache keeps state), so clear loading to avoid a stuck disabled spinner.
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
        // Early domain check for UX; the real enforcement is server-side in /auth/callback.
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
          // Restrict Google's account chooser to the org domain (UX); enforcement is in the server callback.
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
        <Loader size="sm" color="white" aria-hidden />
      ) : (
        <FcGoogle className="h-6 w-6" aria-hidden />
      )}
      Google でログイン
    </button>
  );
};
