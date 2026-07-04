import { Metadata } from "next";
import { Footer } from "./components/Footer";
import "./globals.css";
import "@mantine/core/styles.css";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import SupabaseProvider from "./components/providers/SupabaseProvider";
import AuthProvider from "./components/auth/AuthProvider";
import { QueryProvider } from "./components/providers/QueryProvider";

export const metadata: Metadata = {
  title: "案件管理アプリ",
  description: "未来技術推進協会用の案件管理アプリです。",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <SupabaseProvider>
          <QueryProvider>
            <MantineProvider>
              <AuthProvider>
                {children}
                <Footer />
              </AuthProvider>
            </MantineProvider>
          </QueryProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}
