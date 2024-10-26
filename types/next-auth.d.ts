import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      supabaseAccessToken: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      // 他に必要なユーザープロパティがあれば追加してください
    };
  }
}
