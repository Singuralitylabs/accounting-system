"use client";

import { Button } from "@mantine/core";
import { signIn, signOut } from "next-auth/react";

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

export function SignOut() {
  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error(err);
    }
  };

  return <button onClick={handleSignOut}>サインアウト</button>;
}
