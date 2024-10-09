"use server";

import { signIn } from "@/auth";

export const handleSignIn = async () => {
  try {
    await signIn("google");
  } catch (err) {
    console.error(err);
  }
};
