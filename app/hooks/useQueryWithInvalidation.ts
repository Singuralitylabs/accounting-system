import { useCallback, useSyncExternalStore } from "react";
import {
  hashKey,
  QueryKey,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from "@tanstack/react-query";

// Subscribes to whether the query is invalidated and not yet refetched. isInvalidated persists until a successful refetch. Reading getQueryState once at render would miss invalidations without a refetch (refetchType: "none", inactive queries), so subscribe to queryCache.
export const useIsQueryInvalidated = (queryKey: QueryKey): boolean => {
  const queryClient = useQueryClient();
  // queryKey is a new array each render, so depend on its hash. Filter to this query's events only.
  const hash = hashKey(queryKey);
  const subscribe = useCallback(
    (onChange: () => void) =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.query.queryHash === hash) onChange();
      }),
    [queryClient, hash],
  );
  return useSyncExternalStore(
    subscribe,
    () => queryClient.getQueryState(queryKey)?.isInvalidated ?? false,
    () => false,
  );
};

// useQuery that refetches an invalidated list on mount (QueryProvider defaults to refetchOnMount: false, which allowed editing a stale list and double-registering) and exposes isInvalidated separately from isStale.
// Caveat: screens locking edits on isInvalidated (useSaveRefreshLock) get a lock without any message if an invalidation leaves no refetch or failure (refetchType: "none", cancelled query); provide a refetch path when adding such invalidations.
export const useQueryWithInvalidation = <
  TQueryFnData,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: Omit<
    UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    "refetchOnMount"
  >,
) => {
  const query = useQuery({
    ...options,
    refetchOnMount: (q) => q.state.isInvalidated,
  });
  const isInvalidated = useIsQueryInvalidated(options.queryKey as QueryKey);
  // Spreading would read every property of the result and defeat tracked properties (more re-renders).
  return Object.assign(query, { isInvalidated });
};
