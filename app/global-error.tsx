"use client";

import { Button, MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { useEffect } from "react";
import { notifyError } from "@/app/utils/notify";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    notifyError("アプリケーションでエラーが発生しました。");
  }, [error]);

  return (
    <html lang="ja">
      <body>
        <MantineProvider>
          <Notifications />
          <main className="flex flex-col items-center justify-center gap-4 min-h-[40vh] px-4">
            <p className="text-center text-gray-700">
              アプリケーションでエラーが発生しました。時間をおいて再度お試しください。
            </p>
            <Button onClick={reset}>再試行</Button>
          </main>
        </MantineProvider>
      </body>
    </html>
  );
}
