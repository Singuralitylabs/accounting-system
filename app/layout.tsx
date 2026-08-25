import { Metadata } from "next";
import { Footer } from "./components/Footer";
import "./globals.css";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import SupabaseProvider from "./components/providers/SupabaseProvider";
import AuthProvider from "./components/auth/AuthProvider";
import { QueryProvider } from "./components/providers/QueryProvider";
import { DatesLocaleProvider } from "./components/providers/DatesLocaleProvider";

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
              <Notifications />
              <DatesLocaleProvider>
                <AuthProvider>
                  {children}
                  <Footer />
                </AuthProvider>
              </DatesLocaleProvider>
            </MantineProvider>
          </QueryProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}
