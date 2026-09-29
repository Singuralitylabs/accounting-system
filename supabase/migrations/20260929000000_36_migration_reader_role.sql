-- リリース PR 作成ワークフロー（.github/workflows/release-pr.yml）が本番 DB の
-- `supabase migration list` を読み取るための専用ロール migration_reader を作る（Issue #195）
--
-- これまで本番の SQL Editor で手動作成していたロールと権限を、ローカル（supabase db reset）でも
-- 同じ状態を再現できるようにマイグレーションにする。本番には既に存在するため、ロールが無い場合だけ
-- 作成する（冪等）。
--
-- パスワードはここでは設定しない（マイグレーションに平文を残さない）。ロールを作った後に、
-- 手元の psql から `\password migration_reader` で設定する（docs/release.md）。パスワード未設定の
-- ロールはパスワード認証でログインできないため、設定するまでは接続に使えない。
--
-- 権限は `migration list` が参照する履歴テーブルの SELECT だけに絞る。接続情報が漏れても
-- 業務データ（public スキーマのテーブル）は読めない。
--
-- 詳細設計: docs/database.md 5.16

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'migration_reader'
  ) THEN
    CREATE ROLE migration_reader LOGIN;
  END IF;
END
$$;

-- supabase_migrations スキーマは CLI がマイグレーション適用前に作るため、ここでは常に存在する
GRANT USAGE ON SCHEMA supabase_migrations TO migration_reader;
GRANT SELECT ON supabase_migrations.schema_migrations TO migration_reader;
