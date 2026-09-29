import { useCallback, useSyncExternalStore } from "react";
import {
  hashKey,
  QueryKey,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from "@tanstack/react-query";

// クエリが「無効化されていて、まだ取り直せていない」状態かを購読して返す。
// invalidateQueries で立つ isInvalidated は成功した再取得まで残る（取得に失敗しても
// 残る）。getQueryState をレンダー時に 1 回読むだけだと、再取得を伴わない無効化
// （refetchType: "none"・非アクティブなクエリなど）で再描画されず古い値のままになるため、
// queryCache を購読して変化のたびに再描画する（Issue #189）
export const useIsQueryInvalidated = (queryKey: QueryKey): boolean => {
  const queryClient = useQueryClient();
  // queryKey は毎レンダー新しい配列なので、ハッシュ文字列を依存にする。対象のクエリの
  // イベントだけ通し、他のクエリのイベントで getSnapshot を走らせない
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

// 無効化された一覧の取り直しと、無効化状態（isInvalidated）の購読をまとめた useQuery。
// - 画面を離れている間に無効化された一覧は、開き直したときに取り直す
//   （QueryProvider の既定は refetchOnMount: false。古い一覧のまま編集して二重登録
//   するのを防ぐ。Issue #170）
// - isInvalidated は staleTime の経過でも true になる isStale と区別できるよう別に返す
export const useQueryWithInvalidation = <
  TQueryFnData,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  // refetchOnMount は本フックが決めるため受け付けない
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
  // スプレッドすると useQuery の結果の全プロパティを読むことになり、変更の追跡
  // （tracked properties）が効かなくなって再描画が増えるため、結果に追加する
  return Object.assign(query, { isInvalidated });
};
