import { Metadata } from "next";
import { Footer } from "./components/Footer";
import Header from "./components/Header";
import "./globals.css";
import "@mantine/core/styles.css";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import { SessionProvider } from "next-auth/react";
import { AuthStateListener } from "./components/auth-components";

export const metadata: Metadata = {
  title: "案件管理アプリ",
  description: "未来技術推進協会用の案件管理アプリです。",
};

export default function RootLayout({
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
        <SessionProvider>
          <AuthStateListener />
          <MantineProvider>
            <Header />
            {children}
            <Footer />
          </MantineProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
