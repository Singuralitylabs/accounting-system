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
            staleTime: 5 * 60 * 1000,
            gcTime: 10 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 2,
            refetchOnMount: false,
          },
          mutations: {
            // Writes are not retried by default: if the response is lost after commit, re-running mutationFn would double-insert rows (INSERT-containing saves). All writes are uniformly not auto-retried; failures are reported and the user retries (docs/specification.md 9.1). The explicit retry: 0 on non-idempotent hooks keeps them safe if this default changes.
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
