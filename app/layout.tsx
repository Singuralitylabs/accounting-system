import { Metadata } from "next";
import { Footer } from "./components/Footer";
import Header from "./components/Header";
import "./globals.css";
import "@mantine/core/styles.css";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import SupabaseProvider from "./components/providers/SupabaseProvider";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "案件管理アプリ",
  description: "未来技術推進協会用の案件管理アプリです。",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return (
    <html lang="ja">
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <SupabaseProvider>
          <MantineProvider>
            {session && <Header />}
            {children}
            <Footer />
          </MantineProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}
