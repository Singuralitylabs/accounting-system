"use client";

import { Button } from "@mantine/core";
import { createClient } from "@supabase/supabase-js";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect } from "react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function SignIn({
  ...props
}: React.ComponentPropsWithRef<typeof Button>) {
  const handleSignIn = async () => {
    try {
      await signIn("google", { callbackUrl: "/" });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <button onClick={handleSignIn} {...props}>
      サインイン
    </button>
  );
}

export function SignOut({
  ...props
}: React.ComponentPropsWithRef<typeof Button>) {
  const handleSignOut = async () => {
    try {
      await signOut({ callbackUrl: "/login", redirect: true });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <button onClick={handleSignOut} {...props}>
      サインアウト
    </button>
  );
}

export function AuthStateListener() {
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.user) {
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
          signOut({ callbackUrl: "/login" });
        }
      });
    }
  }, [session]);

  return null;
}
