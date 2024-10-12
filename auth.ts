import { SupabaseAdapter } from "@auth/supabase-adapter";
import { createClient } from "@supabase/supabase-js";
import NextAuth, { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const config: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  adapter: SupabaseAdapter({
    url: process.env.SUPABASE_URL!,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  }),
  // debug: true,
  trustHost: true,
  basePath: "/api/auth",
  callbacks: {
    async signIn({ user, account }) {
      if (account && account.provider === "google") {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: account.id_token!,
        });

        if (error) {
          console.error("Error signing in to Supabase:", error);
          return false;
        }
      }
      return true;
    },
    async session({ session, user }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: user.id,
        },
      };
    },
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      return token;
    },
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      if (pathname === "/protected-page") return !!auth;
      return true;
    },
  },
  events: {
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error signing out from Supabase:", error);
      }
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
