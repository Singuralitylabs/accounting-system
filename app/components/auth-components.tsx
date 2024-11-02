"use client";

import {
  createClientComponentClient,
  User,
} from "@supabase/auth-helpers-nextjs";
import { Button } from "@mantine/core";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface SignInProps {
  className?: string;
  buttonText?: string;
}

interface SignOutProps {
  className?: string;
  buttonText?: string;
  onSignOutSuccess?: () => void;
}

export const SignIn = ({ className, buttonText = "ログイン" }: SignInProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClientComponentClient();

  const handleSignIn = async () => {
    try {
      const redirectUrl = `${window.location.origin}/auth/callback`;
      console.log("Redirect URL:", redirectUrl); // デバッグ用
      console.log("Window Location:", window.location);
      setIsLoading(true);
      const { data, error } = await supabase.auth.signInWithOAuth({
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
      // デバッグ用
      console.log("Auth Response:", { data, error });
    } catch (error) {
      console.error("ログイン処理でエラーが発生しました:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleSignIn}
      loading={isLoading}
      className={className}
      variant="filled"
      color="blue"
    >
      {buttonText}
    </Button>
  );
};

export const SignOut = ({
  className,
  buttonText = "ログアウト",
  onSignOutSuccess,
}: SignOutProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClientComponentClient();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("ログアウトエラー:", error.message);
      } else {
        onSignOutSuccess?.();
        router.refresh();
      }
    } catch (error) {
      console.error("ログアウト処理でエラーが発生しました:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleSignOut}
      loading={isLoading}
      className={className}
      variant="light"
      color="gray"
    >
      {buttonText}
    </Button>
  );
};

// ユーザーセッション取得用のカスタムフック
export const useSupabaseSession = () => {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(null);

  const getSession = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    } catch (error) {
      console.error("セッション取得エラー:", error);
    } finally {
      setLoading(false);
    }
  };

  return { user, loading, getSession };
};
