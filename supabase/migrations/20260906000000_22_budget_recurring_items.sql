-- budget_recurring_items: 事前収支申告の定期明細（毎月固定の収入・支出）
--
-- 経理からの要望「事前収支申告に、毎月固定の収入・支出を登録できる機能がほしい」
-- （Issue #109）に対応する。一度登録すれば、適用期間内の対象月で新規申告を作成する
-- たびに明細として自動展開される（実体は budget_declaration_items としてコピーされ、
-- 保存後は通常の申告明細と同じく個別に編集・削除できる。recurring_costs が損益計算書
-- 集計時に計算で算入するのとは異なり、本テーブル自体は集計に使わない）。
-- 詳細設計: docs/database.md 3.12 / 5.11, Issue #109

CREATE TABLE budget_recurring_items (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team          text NOT NULL,
  entry_type    text NOT NULL CHECK (entry_type IN ('income', 'expense')),
  category      text NOT NULL,
  description   text NOT NULL,
  amount        numeric(15,2) NOT NULL CHECK (amount > 0),
  manager_id    bigint REFERENCES profiles (id),
  start_month   date NOT NULL,
  end_month     date,
  display_order integer NOT NULL DEFAULT 0,
  inserted_at   timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- budget_declarations.target_month と同じ理由（月初日以外を弾き、月単位の
  -- 期間比較を betwen 判定だけで済ませる）で月初日を強制する
  CONSTRAINT budget_recurring_items_start_month_check
    CHECK (start_month = date_trunc('month', start_month)::date),
  CONSTRAINT budget_recurring_items_end_month_check
    CHECK (end_month IS NULL OR end_month = date_trunc('month', end_month)::date),
  CONSTRAINT budget_recurring_items_period_check
    CHECK (end_month IS NULL OR end_month >= start_month)
);

COMMENT ON TABLE budget_recurring_items IS '事前収支申告の定期明細マスタ。毎月固定で発生する収入・支出を登録し、対象月が適用期間（start_month〜end_month、両方月初日で格納。end_month は NULL = 継続中）内であれば新規申告の作成時に budget_declaration_items として展開する。展開後は通常の明細と同じく個別に編集・削除でき、本テーブル自体は変更されない（recurring_costs と異なり集計には使わない）。金額改定は recurring_costs と同じ運用（既存行の end_month を設定して打ち切り、新行を追加）を想定する';
COMMENT ON COLUMN budget_recurring_items.manager_id IS '明細の担当者。budget_declaration_items.manager_id と同じく任意選択・NO ACTION（担当者に設定されたメンバーの profiles を削除しようとすると FK エラーになる）';

-- 新規申告作成時に「対象月 (start_month, end_month) を含む」行を team で絞って
-- 探すクエリを支える複合インデックス（start_month <= 対象月 AND (end_month IS NULL OR end_month >= 対象月)）。
-- team 単独の索引は別途張らない。team 単体の絞り込み（getBudgetRecurringItemList
-- の一覧取得はこの列で絞らないが、RLS の can_access_team_budget 経由の等価条件も
-- 含め）は、この複合インデックスが team を先頭列に持つため、そのまま使える
CREATE INDEX IF NOT EXISTS idx_budget_recurring_items_team_period
  ON budget_recurring_items (team, start_month, end_month);
-- FK 側の索引（budget_declaration_items.manager_id と同じ方針）
CREATE INDEX IF NOT EXISTS idx_budget_recurring_items_manager_id
  ON budget_recurring_items (manager_id);

CREATE TRIGGER update_budget_recurring_items_updated_at
    BEFORE UPDATE ON budget_recurring_items
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ===== RLS =====
-- budget_declarations と同じ判定（public.can_access_team_budget、migration 19）を
-- 再利用する。経理・管理者は全チーム、チームリーダーは自チームのみ。
-- 4 コマンドとも条件が同一のため、budget_declaration_items と同様に FOR ALL 1 本にまとめる。
ALTER TABLE budget_recurring_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_recurring_items_all_policy" ON budget_recurring_items
  FOR ALL TO authenticated
  USING (public.can_access_team_budget(budget_recurring_items.team))
  WITH CHECK (public.can_access_team_budget(budget_recurring_items.team));

-- migration 17 の方針に従い、テーブル権限を明示的に付与する（制限的な DEFAULT
-- PRIVILEGES を持つ環境で PostgREST が RLS を評価する前に 403 を返すのを防ぐ）。
-- 実効的なアクセス制御は上記 RLS が担う。
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE budget_recurring_items
  TO authenticated, service_role;

-- anon（未ログイン）はアクセスしないため権限を剥奪する（budget_declarations と同方針）
REVOKE ALL ON TABLE budget_recurring_items FROM anon;
