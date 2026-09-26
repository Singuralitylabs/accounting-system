// PostgREST の取得のページング（サーバ専用）。
// "use server" を付けないのは、Server Action としてクライアントへ公開しないため。

import type { PostgrestError } from "@supabase/supabase-js";

type PageResult<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

// PostgREST は 1 リクエストで返す行数を max_rows（supabase/config.toml・本番とも既定 1000。
// 埋め込みリソースの配列にも掛かる）で黙って打ち切る。集計の取りこぼしを防ぐため、
// 行数が増えうる取得は id のキーセット方式（id > 直前の最大 id を id 順に PAGE_SIZE 件ずつ）で
// ページングして全件を集める（通常は 1 ページ = 1 往復で終わる）。offset 方式と違い、
// 取得の途中で前の行が削除されても後ろの行を読み飛ばさない。
// ページサイズは max_rows 以下にすること（上回ると 1 ページ目が max_rows 件で打ち切られ、
// 最終ページと誤判定して取りこぼす）
export const PAGE_SIZE = 1000;

export const fetchAllPages = async <T extends { id: number }>(
  fetchPage: (afterId: number, limit: number) => PageResult<T>,
): Promise<{ data: T[] | null; error: PostgrestError | null }> => {
  const rows: T[] = [];
  let afterId = 0; // id は 1 以上（GENERATED ... AS IDENTITY）
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

// ID 指定（.in）の取得で、URL に並べる ID の数を抑えるための分割単位
export const ID_CHUNK_SIZE = 200;

// ID 指定（.in）の取得を、ID を ID_CHUNK_SIZE 件ずつに分けて並列に問い合わせ、
// それぞれを fetchAllPages でページングして全件を集める（max_rows による打ち切りと、
// ID が多い場合の URL の長さの両方を避ける）
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
