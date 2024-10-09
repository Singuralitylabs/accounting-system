"use client";

import { Button } from "@mantine/core";
import { signIn, signOut } from "next-auth/react";
import { redirect } from "next/navigation";

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
