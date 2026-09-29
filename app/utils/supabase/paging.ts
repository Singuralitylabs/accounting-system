// Server-only PostgREST paging. No "use server" so it is not exposed as a Server Action.

import type { PostgrestError } from "@supabase/supabase-js";

type PageResult<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

// PostgREST silently truncates responses at max_rows (1000 in config.toml and production; also
// applies to embedded arrays). Growing fetches page by id keyset (id > last id, PAGE_SIZE per page)
// to avoid missing rows; unlike offset, deletions mid-fetch do not skip rows. PAGE_SIZE must be
// <= max_rows, or a full first page would be mistaken for the last page.
export const PAGE_SIZE = 1000;

export const fetchAllPages = async <T extends { id: number }>(
  fetchPage: (afterId: number, limit: number) => PageResult<T>,
): Promise<{ data: T[] | null; error: PostgrestError | null }> => {
  const rows: T[] = [];
  let afterId = 0;  // id starts at 1 (GENERATED ... AS IDENTITY).
  for (;;) {
    const { data, error } = await fetchPage(afterId, PAGE_SIZE);
    if (error) {
      return { data: null, error };
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) {
      return { data: rows, error: null };
    }
    afterId = data[data.length - 1].id;
  }
};

// Chunk size to keep the URL short.
export const ID_CHUNK_SIZE = 200;

// Queries ID_CHUNK_SIZE ids in parallel, each paged with fetchAllPages (avoids both max_rows truncation and long URLs).
export const fetchAllByIds = async <T extends { id: number }>(
  ids: number[],
  fetchPage: (chunk: number[], afterId: number, limit: number) => PageResult<T>,
): Promise<{ data: T[] | null; error: PostgrestError | null }> => {
  const unique = Array.from(new Set(ids));
  const chunks: number[][] = [];
  for (let i = 0; i < unique.length; i += ID_CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + ID_CHUNK_SIZE));
  }
  const results = await Promise.all(
    chunks.map((chunk) =>
      fetchAllPages<T>((afterId, limit) => fetchPage(chunk, afterId, limit)),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed) {
    return { data: null, error: failed.error };
  }
  return {
    data: results.flatMap((result) => result.data ?? []),
    error: null,
  };
};
