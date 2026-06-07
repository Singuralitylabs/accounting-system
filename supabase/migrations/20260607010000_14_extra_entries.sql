-- extra_entries: 経理追加収支（案件に紐づかない収入・支出）
-- 損益計算書が案件管理・定期費用マスタのデータと一致しない場合に、経理担当者・管理者が
-- 収入・支出を直接追加・調整するためのテーブル。集計時に entry_date（日付）の属する月へ
-- 算入する（収入の請求額 → 売上合計、経費 → 案件費用合計。日付未入力は月未確定）。
-- 金額はマイナスを許容し、案件側のデータを直さずに損益計算書上で減額調整できる。
CREATE TABLE extra_entries (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_type     text NOT NULL CHECK (entry_type IN ('income', 'expense')),
  category       text NOT NULL,
  entry_date     date,
  invoice_number text,
  description    text NOT NULL,
  billing_target text,
  manager_id     bigint NOT NULL REFERENCES profiles (id),
  team           text,
  billing_amount numeric(15,2) CHECK (billing_amount <> 0),
  expense_amount numeric(15,2) CHECK (expense_amount <> 0),
  payment_method text,
  inserted_at    timestamptz NOT NULL DEFAULT timezone('Asia/Tokyo'::text, now()),
  updated_at     timestamptz NOT NULL DEFAULT timezone('Asia/Tokyo'::text, now()),
  -- 収入: 請求額必須・決済方法なし / 支出: 経費・決済方法必須、収入専用項目なし
  CONSTRAINT extra_entries_type_fields_check CHECK (
    (entry_type = 'income' AND billing_amount IS NOT NULL AND payment_method IS NULL) OR
    (entry_type = 'expense' AND expense_amount IS NOT NULL AND payment_method IS NOT NULL
      AND billing_amount IS NULL AND invoice_number IS NULL AND billing_target IS NULL)
  )
);

COMMENT ON TABLE extra_entries IS '経理追加収支。team が NULL の行は全体共通。entry_date が NULL の行は月未確定として扱う。金額はマイナス可（減額調整用）';

CREATE INDEX IF NOT EXISTS idx_extra_entries_team       ON extra_entries (team);
CREATE INDEX IF NOT EXISTS idx_extra_entries_entry_date ON extra_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_extra_entries_manager_id ON extra_entries (manager_id);

CREATE TRIGGER update_extra_entries_updated_at
    BEFORE UPDATE ON extra_entries
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

ALTER TABLE extra_entries ENABLE ROW LEVEL SECURITY;

-- 経理担当者/管理者は全行、チームリーダーは自チームの行 + 全体共通（team IS NULL）の行を参照可能
-- （全体共通の行はチームリーダー画面で「全体共通（参考）」として表示するためで、チーム損益には算入しない）
CREATE POLICY "extra_entries_select_policy" ON extra_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class IN ('admin', 'accounting')
    ) OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class = 'teamleader'
      AND profiles.team IS NOT NULL
      AND (extra_entries.team IS NULL OR extra_entries.team = profiles.team)
    )
  );

-- 経理担当者/管理者のみ挿入可能
CREATE POLICY "extra_entries_insert_policy" ON extra_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class IN ('admin', 'accounting')
    )
  );

-- 経理担当者/管理者のみ更新可能
CREATE POLICY "extra_entries_update_policy" ON extra_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class IN ('admin', 'accounting')
    )
  );

-- 経理担当者/管理者のみ削除可能
CREATE POLICY "extra_entries_delete_policy" ON extra_entries
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class IN ('admin', 'accounting')
    )
  );

-- ===== 選択肢マスタ（収入分類 / 支出分類 / 決済方法） =====
-- 分類は暫定の初期値のため、実運用に合わせて管理画面（マスタデータ管理）で編集する
INSERT INTO select_option_types (name, display_name, category, display_order) VALUES
    ('extra_income_category', '収入分類', 'business_info', 1),
    ('extra_expense_category', '支出分類', 'cost_info', 3),
    ('payment_method', '決済方法', 'cost_info', 4);

INSERT INTO select_options (type_id, value, display_order) VALUES
    ((SELECT id FROM select_option_types WHERE name = 'extra_income_category'), '協賛金', 1),
    ((SELECT id FROM select_option_types WHERE name = 'extra_income_category'), '助成金', 2),
    ((SELECT id FROM select_option_types WHERE name = 'extra_income_category'), '受託収入', 3),
    ((SELECT id FROM select_option_types WHERE name = 'extra_income_category'), 'その他収入', 4);

INSERT INTO select_options (type_id, value, display_order) VALUES
    ((SELECT id FROM select_option_types WHERE name = 'extra_expense_category'), '消耗品費', 1),
    ((SELECT id FROM select_option_types WHERE name = 'extra_expense_category'), '交通費', 2),
    ((SELECT id FROM select_option_types WHERE name = 'extra_expense_category'), '会議費', 3),
    ((SELECT id FROM select_option_types WHERE name = 'extra_expense_category'), '通信費', 4),
    ((SELECT id FROM select_option_types WHERE name = 'extra_expense_category'), 'その他経費', 5);

INSERT INTO select_options (type_id, value, display_order) VALUES
    ((SELECT id FROM select_option_types WHERE name = 'payment_method'), '銀行振込', 1),
    ((SELECT id FROM select_option_types WHERE name = 'payment_method'), 'クレジットカード', 2),
    ((SELECT id FROM select_option_types WHERE name = 'payment_method'), '口座引き落とし', 3),
    ((SELECT id FROM select_option_types WHERE name = 'payment_method'), '現金', 4);
