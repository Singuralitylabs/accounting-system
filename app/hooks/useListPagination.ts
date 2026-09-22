"use client";

import { useEffect, useMemo, useState } from "react";

export const MATTER_LIST_PAGE_SIZES = [12, 24, 48, 96] as const;
export const DEFAULT_MATTER_LIST_PER_PAGE = 24;

// 一覧のクライアント側ページネーション。
// サーバ側の絞り込み（ActiveMatterFilterBar 等）・ソート後の配列を受け取り、
// 表示範囲だけを切り出す。チェックボックスの選択状態は呼び出し側で保持するため、
// ページをまたいでも選択は維持される（非表示分は partitionCheckedMatters で扱う）。
// 件数がページサイズ以下の場合は全件表示となり、導入前後で表示内容は変わらない。
export function useListPagination<T>(
  items: readonly T[],
  options?: {
    initialPerPage?: number;
    // フィルタ条件など、変わったら1ページ目に戻したい値の文字列表現
    resetKey?: string;
  },
) {
  const initialPerPage =
    options?.initialPerPage ?? DEFAULT_MATTER_LIST_PER_PAGE;
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initialPerPage);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  // レンダリング中に setState せず、範囲外ページは表示時に丸める
  const safePage = Math.min(Math.max(1, page), totalPages);

  const resetKey = options?.resetKey;
  // フィルタ条件（resetKey）・表示件数の変更時に1ページ目に戻る。
  // 件数の増減（新規作成・削除・再取得）では戻さず、範囲外ページの丸め（safePage）に任せる。
  useEffect(() => {
    setPage(1);
  }, [resetKey, perPage]);

  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * perPage;
    return items.slice(start, start + perPage);
  }, [items, safePage, perPage]);

  const startIndex = total === 0 ? 0 : (safePage - 1) * perPage + 1;
  const endIndex = Math.min(safePage * perPage, total);

  return {
    page: safePage,
    setPage,
    perPage,
    setPerPage,
    total,
    totalPages,
    startIndex,
    endIndex,
    pagedItems,
    // ページネーション UI 自体が不要な件数か（呼び出し側で UI の出し分けに使う）
    showPagination: total > perPage,
  };
}
