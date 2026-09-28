"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5分間はキャッシュを使用
            gcTime: 10 * 60 * 1000, // 10分後にGC
            refetchOnWindowFocus: false,
            retry: 2,
            refetchOnMount: false, // マウント時の自動再取得を無効化
          },
          mutations: {
            // 書き込みは既定で再実行しない。コミット後に応答だけ失われた場合に mutationFn が
            // 再実行されると、INSERT を含む保存で行が二重に登録されるため（Issue #169）。
            // 冪等な書き込みも含めて一律に自動では再試行せず、失敗したらエラーを通知して
            // 利用者に操作をやり直してもらう（docs/specification.md 9.1）。非冪等なフックに
            // 残している retry: 0 は、既定が変わっても再実行されないことを明示するもの
            retry: 0,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
