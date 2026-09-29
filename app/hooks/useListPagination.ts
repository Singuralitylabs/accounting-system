"use client";

import { useEffect, useMemo, useState } from "react";

export const MATTER_LIST_PAGE_SIZES = [12, 24, 48, 96] as const;
export const DEFAULT_MATTER_LIST_PER_PAGE = 24;

// Client-side pagination over the already filtered/sorted array. Checkbox selection is held by the caller, so it survives page changes.
export function useListPagination<T>(
  items: readonly T[],
  options?: {
    initialPerPage?: number;
    resetKey?: string;
  },
) {
  const initialPerPage =
    options?.initialPerPage ?? DEFAULT_MATTER_LIST_PER_PAGE;
  const [page, setPage] = useState(1);
  // initialPerPage applies on first mount only.
  const [perPage, setPerPage] = useState(initialPerPage);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const gotoPage = (next: number) => {
    setPage(Math.min(Math.max(1, next), totalPages));
  };

  const resetKey = options?.resetKey;
  // Reset to page 1 on resetKey/page size change; count changes are handled by clamping (safePage).
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
    setPage: gotoPage,
    perPage,
    setPerPage,
    total,
    totalPages,
    startIndex,
    endIndex,
    pagedItems,
    showPagination: total > perPage,
  };
}
