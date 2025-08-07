'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5分間はキャッシュを使用
        gcTime: 10 * 60 * 1000,   // 10分後にGC
        refetchOnWindowFocus: false,
        retry: 2,
        refetchOnMount: false, // マウント時の自動再取得を無効化
      },
      mutations: {
        retry: 1,
      }
    }
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}