-- profit_loss_adjustments: 損益調整（案件の売上・案件費用・管理費の実績額修正）
--
-- 経理からの要望「損益計算書に、月別の収入・支出の編集機能がほしい」（Issue #108）に
-- 対応する。案件（business / costs）・定期費用マスタ（recurring_costs）の元データは
-- 一切書き換えず、対象月ごとの調整（差分）を本テーブルに保持し、損益計算書では
-- 「元データ + 調整 = 実績」として表示・集計する。
-- 元データを直接書き換えない理由:
--   - business / costs は案件ライフサイクル・差し戻し検知の対象で、経理が直接
--     書き換えると担当者の見ている案件が変わり、差し戻し検知が誤発火する
--   - recurring_costs は適用期間で全月に反映されるため、金額欄を直すと全月が
--     変わってしまい、ある月だけの差異を表現できない
-- 詳細設計: docs/database.md 3.13 / 5.12, Issue #108

CREATE TABLE profit_loss_adjustments (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_month           date NOT NULL,
  business_id            bigint REFERENCES business (id) ON DELETE CASCADE,
  cost_id                bigint REFERENCES costs (id) ON DELETE CASCADE,
  recurring_cost_id      bigint REFERENCES recurring_costs (id) ON DELETE CASCADE,
  adjustment_amount      numeric(15,2) NOT NULL,
  source_amount_snapshot numeric(15,2) NOT NULL,
  reason                 text NOT NULL,
  adjusted_by            bigint NOT NULL REFERENCES profiles (id),
  inserted_at            timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- budget_declarations.target_month と同じ理由で月初日を強制する
  CONSTRAINT profit_loss_adjustments_target_month_check
    CHECK (target_month = date_trunc('month', target_month)::date),
  -- 0 は許可しない。実績額が元データと同額になった場合はレコード自体を削除する
  -- （アプリ側の運用。DB は「保存されている調整は必ず差分がある」ことだけを担保する）
  CONSTRAINT profit_loss_adjustments_amount_check
    CHECK (adjustment_amount <> 0),
  -- ポリモーフィック参照にせず実 FK を3本張るため、対象は必ずちょうど1つに限定する
  -- （0個だと調整対象が無い、2個以上だと元データ変更検知がどの行を指すか決まらない）
  CONSTRAINT profit_loss_adjustments_exactly_one_target_check
    CHECK (num_nonnulls(business_id, cost_id, recurring_cost_id) = 1)
);

COMMENT ON TABLE profit_loss_adjustments IS '損益調整。対象行（business / costs / recurring_costs のいずれか1つ）× target_month（月初日）ごとに、実績額と元データの差分（adjustment_amount）を保持する。損益計算書は「元データ + adjustment_amount = 実績」として表示・集計する。元データ（business / costs / recurring_costs）は変更しない。source_amount_snapshot は保存時点の元データ金額で、現在の元データ金額と異なる場合は画面に「元データが変更されています」警告を表示する（本テーブルの値は自動追従しない）';
COMMENT ON COLUMN profit_loss_adjustments.adjustment_amount IS '実績額と元データ金額の差分（実績額 − 保存時点の元データ金額）。0 は許可しない（実績額が元データと同額なら調整レコード自体を削除する）';
COMMENT ON COLUMN profit_loss_adjustments.source_amount_snapshot IS '保存時点の元データ金額（business.amount / costs.price / recurring_costs.price のいずれか、対象に応じて1つ）。元データ変更検知用の比較にのみ使う（実績額の計算には現在の元データ金額 + adjustment_amount を使う）';

-- FK 側の索引を兼ねる（UNIQUE インデックスの先頭列を FK 列にしているため、対象行
-- 削除時の CASCADE 検索・Supabase の unindexed_foreign_keys リンタの両方をこれで満たす）。
-- 「対象行 × target_month は1件」（同じ行・同じ月への調整は1件）を保証する。
-- target_month 単独のインデックスは張らない（budget_declarations と同じ理由。損益
-- 計算書は全件取得して月ごとにメモリ上で振り分けるため、target_month 単体の絞り込み
-- クエリは現時点で発生しない）。
CREATE UNIQUE INDEX profit_loss_adjustments_business_id_month_key
  ON profit_loss_adjustments (business_id, target_month)
  WHERE business_id IS NOT NULL;
CREATE UNIQUE INDEX profit_loss_adjustments_cost_id_month_key
  ON profit_loss_adjustments (cost_id, target_month)
  WHERE cost_id IS NOT NULL;
CREATE UNIQUE INDEX profit_loss_adjustments_recurring_cost_id_month_key
  ON profit_loss_adjustments (recurring_cost_id, target_month)
  WHERE recurring_cost_id IS NOT NULL;
-- FK 側の索引（extra_entries.manager_id と同じ方針）
CREATE INDEX IF NOT EXISTS idx_profit_loss_adjustments_adjusted_by
  ON profit_loss_adjustments (adjusted_by);

CREATE TRIGGER update_profit_loss_adjustments_updated_at
    BEFORE UPDATE ON profit_loss_adjustments
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ===== RLS =====
-- 書き込み（INSERT/UPDATE/DELETE）は accounting / admin のみ。
-- SELECT は accounting / admin が全行、teamleader は対象行のチームが自チーム、
-- または全体共通（recurring_costs.team IS NULL）の行のみ（recurring_costs /
-- extra_entries と同じ方針）。
--
-- 調整行自体には team 列が無く、対象（business → matters.team / costs →
-- matters.team / recurring_costs.team）を辿って判定する必要があるため、
-- can_access_team_budget（migration 19）と同じ理由でヘルパー関数へ切り出す。
--
-- pl_adjustment_team は SECURITY DEFINER にする。matters / costs / business の
-- 既存 RLS（teamleader は自チームの行のみ SELECT 可）に判定を委ねると、他チームの
-- 対象行は「見えない」＝ NULL が返り、下の can_view_pl_adjustment が「対象不明 = 全体
-- 共通」として誤って表示を許可してしまう（auth_user_class / auth_user_team と同じ
-- 理由。migration 12 参照）。SECURITY DEFINER で常に実際のチームを取得することで、
-- 「対象行のチームが分からない」状態を作らない。
CREATE OR REPLACE FUNCTION public.pl_adjustment_team(
  p_business_id bigint,
  p_cost_id bigint,
  p_recurring_cost_id bigint
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_business_id IS NOT NULL THEN (
      SELECT matters.team FROM public.business
      JOIN public.matters ON matters.id = business.matter_id
      WHERE business.id = p_business_id
    )
    WHEN p_cost_id IS NOT NULL THEN (
      SELECT matters.team FROM public.costs
      JOIN public.matters ON matters.id = costs.matter_id
      WHERE costs.id = p_cost_id
    )
    ELSE (
      SELECT recurring_costs.team FROM public.recurring_costs
      WHERE recurring_costs.id = p_recurring_cost_id
    )
  END
$$;

COMMENT ON FUNCTION public.pl_adjustment_team(bigint, bigint, bigint) IS
  '損益調整（profit_loss_adjustments）の対象行が属するチームを返す。business / costs は matters.team 経由（NOT NULL）、recurring_costs は team 列を直接参照する（NULL 可 = 全体共通）。matters / costs / business 自体の RLS に依存しないよう SECURITY DEFINER にしている。詳細: docs/database.md 5.12';

CREATE OR REPLACE FUNCTION public.can_view_pl_adjustment(
  p_business_id bigint,
  p_cost_id bigint,
  p_recurring_cost_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT public.auth_user_class() IN ('admin', 'accounting')
      OR (
        public.auth_user_class() = 'teamleader'
        AND public.auth_user_team() IS NOT NULL
        AND (
          public.pl_adjustment_team(p_business_id, p_cost_id, p_recurring_cost_id) IS NULL
          OR public.pl_adjustment_team(p_business_id, p_cost_id, p_recurring_cost_id) = public.auth_user_team()
        )
      )
$$;

COMMENT ON FUNCTION public.can_view_pl_adjustment(bigint, bigint, bigint) IS
  '損益調整（profit_loss_adjustments）の SELECT 判定。経理・管理者は全行、チームリーダーは自チームの対象行 + 全体共通（recurring_costs.team IS NULL）の対象行のみ true。詳細: docs/database.md 5.12';

-- 不特定多数からの直接呼び出しを避け、認証済みロールのみに実行を許可する（migration 12 と同方針）
REVOKE EXECUTE ON FUNCTION public.pl_adjustment_team(bigint, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pl_adjustment_team(bigint, bigint, bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_view_pl_adjustment(bigint, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_pl_adjustment(bigint, bigint, bigint) TO authenticated;

ALTER TABLE profit_loss_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profit_loss_adjustments_select_policy" ON profit_loss_adjustments
  FOR SELECT TO authenticated
  USING (
    public.can_view_pl_adjustment(business_id, cost_id, recurring_cost_id)
  );

-- 書き込みは accounting / admin のみ（対象行のチームは問わない。extra_entries /
-- recurring_costs と同じ方針で、チームリーダーには一切の書き込みを許可しない）
CREATE POLICY "profit_loss_adjustments_insert_policy" ON profit_loss_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_user_class() IN ('admin', 'accounting'));

CREATE POLICY "profit_loss_adjustments_update_policy" ON profit_loss_adjustments
  FOR UPDATE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'))
  WITH CHECK (public.auth_user_class() IN ('admin', 'accounting'));

CREATE POLICY "profit_loss_adjustments_delete_policy" ON profit_loss_adjustments
  FOR DELETE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'));

-- ===== GRANT =====
-- migration 17 の方針に従い、テーブル権限を明示的に付与する（制限的な DEFAULT
-- PRIVILEGES を持つ環境で PostgREST が RLS を評価する前に 403 を返すのを防ぐ）。
-- 実効的なアクセス制御は上記 RLS が担う。
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profit_loss_adjustments
  TO authenticated, service_role;

-- anon（未ログイン）はアクセスしないため権限を剥奪する（budget_declarations と同方針）
REVOKE ALL ON TABLE profit_loss_adjustments FROM anon;
