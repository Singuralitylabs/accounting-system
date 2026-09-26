-- 損益調整の SELECT で、チームリーダーが自分で作成した案件の調整も見えるようにする（Issue #148）
--
-- チームリーダーは matters / business / costs の RLS で「自チームの案件」に加えて
-- 「自分が作成した案件」（matters.user_id = 自分）の行も読める。損益計算書のライブ集計では
-- それらの行が表示される一方、損益調整（profit_loss_adjustments）の SELECT 判定
-- （private.can_view_pl_adjustment。migration 23）は対象のチームだけを見ていたため、
-- 自分が作成した他チームの案件の明細は「調整なし（元データの金額）」で表示されていた。
-- 確定明細（migration 27）・表示タイトル（migration 26）は作成者の分岐で同じ範囲を
-- 読めるため、確定済みの月だけ調整後の実績額・調整理由が見え、確定・解除のたびに表示が
-- 変わっていた。損益調整にも同じ作成者の分岐を加え、確定の前後で表示を揃える。
--
-- 対象の案件の作成者は private.pl_label_matter_user（migration 26。SECURITY DEFINER・
-- private スキーマ）で取得する（定期費用の調整は案件が無いため NULL = 作成者の分岐に該当しない）。
CREATE OR REPLACE FUNCTION private.can_view_pl_adjustment(
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
          private.pl_adjustment_team(p_business_id, p_cost_id, p_recurring_cost_id) IS NULL
          OR private.pl_adjustment_team(p_business_id, p_cost_id, p_recurring_cost_id) = public.auth_user_team()
        )
      )
      OR (
        public.auth_user_class() = 'teamleader'
        AND private.pl_label_matter_user(NULL, p_business_id, p_cost_id) = (
          SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
        )
      )
$$;

COMMENT ON FUNCTION private.can_view_pl_adjustment(bigint, bigint, bigint) IS
  '損益調整（profit_loss_adjustments）の SELECT 判定。経理・管理者は全行、チームリーダーは自チームの対象行 + 全体共通（recurring_costs.team IS NULL）の対象行 + 自分が作成した案件の対象行のみ true。pl_adjustment_team と同じ理由で private スキーマに置く（他チームか否かの boolean でも、任意の id を総当たりする列挙攻撃の材料になり得るため）。詳細: docs/database.md 5.12';
