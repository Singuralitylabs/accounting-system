-- recurring_costs: 定期費用（管理費）マスタ
-- 毎月固定でかかる費用を登録し、損益計算書の集計時に適用期間内の月へ自動算入する。
-- 実レコードは月ごとに生成せず、適用期間（start_month〜end_month）から計算で算出する。
CREATE TABLE recurring_costs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  item        text NOT NULL,
  price       numeric(15,2) NOT NULL,
  team        text,
  start_month date NOT NULL,
  end_month   date,
  comment     text,
  inserted_at timestamptz NOT NULL DEFAULT timezone('Asia/Tokyo'::text, now()),
  updated_at  timestamptz NOT NULL DEFAULT timezone('Asia/Tokyo'::text, now())
);

COMMENT ON TABLE recurring_costs IS '定期費用（管理費）マスタ。team が NULL の行は全体共通。start_month / end_month は月初日で格納し、end_month はその月を含む（NULL = 継続中）';

CREATE INDEX IF NOT EXISTS idx_recurring_costs_team        ON recurring_costs (team);
CREATE INDEX IF NOT EXISTS idx_recurring_costs_start_month ON recurring_costs (start_month);

CREATE TRIGGER update_recurring_costs_updated_at
    BEFORE UPDATE ON recurring_costs
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

ALTER TABLE recurring_costs ENABLE ROW LEVEL SECURITY;

-- 経理担当者/管理者は全行、チームリーダーは自チームの行 + 全体共通（team IS NULL）の行を参照可能
-- （全体共通の行はチームリーダー画面で「全体共通（参考）」として表示するためで、チーム損益には算入しない）
CREATE POLICY "recurring_costs_select_policy" ON recurring_costs
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
      AND (recurring_costs.team IS NULL OR recurring_costs.team = profiles.team)
    )
  );

-- 経理担当者/管理者のみ挿入可能
CREATE POLICY "recurring_costs_insert_policy" ON recurring_costs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class IN ('admin', 'accounting')
    )
  );

-- 経理担当者/管理者のみ更新可能
CREATE POLICY "recurring_costs_update_policy" ON recurring_costs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class IN ('admin', 'accounting')
    )
  );

-- 経理担当者/管理者のみ削除可能
CREATE POLICY "recurring_costs_delete_policy" ON recurring_costs
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class IN ('admin', 'accounting')
    )
  );
