import { Metadata } from "next";
import { Footer } from "./components/Footer";
import "./globals.css";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
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
              <ModalsProvider labels={{ confirm: "OK", cancel: "キャンセル" }}>
                <Notifications />
                <DatesLocaleProvider>
                  <div className="flex min-h-dvh flex-col">
                    <AuthProvider>
                      <div className="flex flex-grow flex-col [&>main]:flex-1">
                        {children}
                      </div>
                    </AuthProvider>
                    <Footer />
                  </div>
                </DatesLocaleProvider>
              </ModalsProvider>
            </MantineProvider>
          </QueryProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}
