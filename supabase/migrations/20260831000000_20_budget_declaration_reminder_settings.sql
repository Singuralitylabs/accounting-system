-- budget_declaration_reminder_settings: 事前収支申告リマインドの対象日設定
--
-- app/utils/budgetDeclarationReminder.ts の BUDGET_DECLARATION_REMINDER_TARGET_DAYS
-- 定数（[15, 18, 20] ハードコード）を DB 化し、デプロイなしで対象日を編集できるようにする。
-- 対象日リストを空にすると cron は実行されるがリマインドは送信されない（実質停止）。
-- 経緯: Issue #94 / PR #93 コメント参照。
--
-- 1 行だけを持つ設定テーブル（id を 1 に固定する CHECK でシングルトンを強制）。
-- キーバリュー形式の汎用設定テーブルにはせず、このリマインド専用にしているのは、
-- 現状ここでしか使わない設定であり、汎用化は不要な抽象化になるため。

CREATE TABLE budget_declaration_reminder_settings (
  id          smallint NOT NULL DEFAULT 1 PRIMARY KEY,
  target_days smallint[] NOT NULL DEFAULT '{15,18,20}',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT budget_declaration_reminder_settings_singleton_check CHECK (id = 1),
  -- 編集手段が RLS をバイパスする Supabase ダッシュボード直編集（docs/database.md
  -- 3.11）のため、typo（0 や 32 等）による無言のリマインド停止を防ぐ DB 層での検証
  CONSTRAINT budget_declaration_reminder_settings_target_days_range_check
    CHECK (1 <= ALL(target_days) AND 31 >= ALL(target_days))
);

COMMENT ON TABLE budget_declaration_reminder_settings IS '事前収支申告の未申告 Slack リマインド対象日設定。1 行のみ（id=1 固定）。target_days が空配列だとリマインド停止。詳細: docs/database.md 3.11 / 5.10';
COMMENT ON COLUMN budget_declaration_reminder_settings.target_days IS 'リマインド対象日（JST の日, 1-31）。空配列 = リマインド停止。DB 取得失敗時は app/utils/budgetDeclarationReminder.ts の DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS ([15, 18, 20]) にフォールバックする';

CREATE TRIGGER update_budget_declaration_reminder_settings_updated_at
    BEFORE UPDATE ON budget_declaration_reminder_settings
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 初期データ: カラム DEFAULT がそのまま従来のハードコード値と同じなので、
-- 全カラム DEFAULT の 1 行を挿入するだけで移行時点の挙動を変えずに済む
-- （直後の CREATE TABLE への INSERT のため ON CONFLICT は不要）
INSERT INTO budget_declaration_reminder_settings DEFAULT VALUES;

-- ===== RLS =====
-- 運用上の設定値であり一般ユーザーは関与しないため、admin / accounting のみ参照・
-- 編集可能とする（budget_declarations の can_access_team_budget と同じロール区分）。
-- cron ルートは service role クライアント（app/utils/supabase/clients.ts の
-- createServiceRoleSupabase）で読むため RLS の対象外。
--
-- 行は migration で作成した 1 行のみを更新し続ける運用のため、INSERT / DELETE の
-- ポリシーは設けない（authenticated ロールからの行追加・削除は一律不可。
-- id への CHECK 制約もあり、admin / accounting であっても新規行の追加はできない）。
ALTER TABLE budget_declaration_reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_declaration_reminder_settings_select_policy"
  ON budget_declaration_reminder_settings
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'));

CREATE POLICY "budget_declaration_reminder_settings_update_policy"
  ON budget_declaration_reminder_settings
  FOR UPDATE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'))
  WITH CHECK (public.auth_user_class() IN ('admin', 'accounting'));

-- ===== GRANT =====
-- migration 17 の ALTER DEFAULT PRIVILEGES により、新規テーブルには何もしなくても
-- anon / authenticated / service_role に SELECT, INSERT, UPDATE, DELETE が
-- 自動的に付く。GRANT SELECT, UPDATE は明示化のためだけで実質的な意味は無いが、
-- INSERT / DELETE は上記の通りポリシーが無く常に拒否したいので、
-- authenticated からは明示的に REVOKE して権限レベルでも塞ぐ
-- （RLS の deny-by-default だけに頼らない多層防御。無いと将来
-- INSERT / DELETE ポリシーを誤って足した瞬間に authenticated から書き込めてしまう）。
GRANT SELECT, UPDATE ON TABLE budget_declaration_reminder_settings TO authenticated;
REVOKE INSERT, DELETE ON TABLE budget_declaration_reminder_settings FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE budget_declaration_reminder_settings TO service_role;

-- anon（未ログイン）は一切アクセスしない
REVOKE ALL ON TABLE budget_declaration_reminder_settings FROM anon;
