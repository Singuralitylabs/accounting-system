// Supabase ヘルパが返す独自エラーコード。
// matters.ts などの "use server" ファイルは async 関数以外を export できないため、
// 定数はこの通常モジュールに置いて双方から参照する。

// 削除対象が 0 行だったことを示す。RLS で弾かれた場合と、既に削除済み
// （二重クリック・別タブでの先行削除）の場合の双方でこのコードになる。
export const NO_ROWS_DELETED = "NO_ROWS_DELETED";

// Postgres の一意制約違反（UNIQUE constraint violation）の SQLSTATE コード
export const UNIQUE_VIOLATION = "23505";

// plpgsql 組み込みの no_data_found の SQLSTATE コード。
// save_budget_declaration（migration 24）が更新対象の行を見つけられなかった
// 場合に RAISE EXCEPTION ... USING ERRCODE = 'P0002' で明示的に使う
export const NO_DATA_FOUND = "P0002";

// Postgres の外部キー制約違反（FOREIGN KEY constraint violation）の SQLSTATE コード
export const FOREIGN_KEY_VIOLATION = "23503";
