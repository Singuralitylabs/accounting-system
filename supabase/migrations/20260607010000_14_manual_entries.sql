-- manual_entries: 案件外収支（案件に紐づかない売上・費用の手動エントリ）
-- 損益計算書が案件管理・定期費用マスタのデータと一致しない場合に、経理担当者・管理者が
-- 売上・費用を直接追加・調整するためのテーブル。集計時に計上月（target_month）へ算入する
-- （売上エントリ → 売上合計、費用エントリ → 案件費用合計）。
-- amount はマイナスを許容し、案件側のデータを直さずに損益計算書上で減額調整できる。
CREATE TABLE manual_entries (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_type   text NOT NULL CHECK (entry_type IN ('revenue', 'cost')),
  name         text NOT NULL,
  category     text,
  item         text,
  amount       numeric(15,2) NOT NULL CHECK (amount <> 0),
  team         text,
  target_month date NOT NULL,
  comment      text,
  inserted_at  timestamptz NOT NULL DEFAULT timezone('Asia/Tokyo'::text, now()),
  updated_at   timestamptz NOT NULL DEFAULT timezone('Asia/Tokyo'::text, now()),
  -- 売上エントリは分類（category）のみ、費用エントリは品目（item）のみを持つ
  CONSTRAINT manual_entries_type_breakdown_check CHECK (
    (entry_type = 'revenue' AND category IS NOT NULL AND item IS NULL) OR
    (entry_type = 'cost' AND item IS NOT NULL AND category IS NULL)
  )
);

COMMENT ON TABLE manual_entries IS '案件外収支（手動エントリ）。team が NULL の行は全体共通。target_month は月初日で格納。amount はマイナス可（減額調整用）';

CREATE INDEX IF NOT EXISTS idx_manual_entries_team         ON manual_entries (team);
CREATE INDEX IF NOT EXISTS idx_manual_entries_target_month ON manual_entries (target_month);

CREATE TRIGGER update_manual_entries_updated_at
    BEFORE UPDATE ON manual_entries
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

ALTER TABLE manual_entries ENABLE ROW LEVEL SECURITY;

-- 経理担当者/管理者は全行、チームリーダーは自チームの行 + 全体共通（team IS NULL）の行を参照可能
-- （全体共通の行はチームリーダー画面で「全体共通（参考）」として表示するためで、チーム損益には算入しない）
CREATE POLICY "manual_entries_select_policy" ON manual_entries
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
      AND (manual_entries.team IS NULL OR manual_entries.team = profiles.team)
    )
  );

-- 経理担当者/管理者のみ挿入可能
CREATE POLICY "manual_entries_insert_policy" ON manual_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class IN ('admin', 'accounting')
    )
  );

-- 経理担当者/管理者のみ更新可能
CREATE POLICY "manual_entries_update_policy" ON manual_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class IN ('admin', 'accounting')
    )
  );

-- 経理担当者/管理者のみ削除可能
CREATE POLICY "manual_entries_delete_policy" ON manual_entries
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class IN ('admin', 'accounting')
    )
  );
