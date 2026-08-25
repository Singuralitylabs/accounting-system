"use client";

import { Button } from "@mantine/core";
import { useEffect } from "react";
import { notifyError } from "@/app/utils/notify";

export default function AppRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    notifyError("ページの表示に失敗しました。");
  }, [error]);

  return (
    <main className="flex flex-col items-center justify-center gap-4 min-h-[40vh] px-4">
      <p className="text-center text-gray-700">
        ページの表示に失敗しました。時間をおいて再度お試しください。
      </p>
      <Button onClick={reset}>再試行</Button>
    </main>
  );
}
