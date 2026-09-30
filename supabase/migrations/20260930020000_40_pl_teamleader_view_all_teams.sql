-- Profit and loss statement: teamleaders can read every team's rows.
--
-- Same approach as budget declarations (migration 38): only SELECT policies are widened so a
-- teamleader can compare against other teams. INSERT / UPDATE / DELETE policies are untouched, so
-- writes stay owner / accounting / admin only. Consequently a teamleader can also read other
-- teams' matters, costs and business rows outside the profit and loss screen.
-- profit_loss_closing_dismissals stays accounting / admin only, and `public` is unchanged.

-- ===== matters / costs / business =====
DROP POLICY "matters_select_policy" ON matters;
CREATE POLICY "matters_select_policy" ON matters
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = matters.user_id
      AND profiles.user_id = (select auth.uid())
    ) OR
    public.auth_user_class() IN ('admin', 'accounting', 'teamleader')
  );

DROP POLICY "costs_select_policy" ON costs;
CREATE POLICY "costs_select_policy" ON costs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matters
      JOIN profiles ON profiles.id = matters.user_id
      WHERE matters.id = costs.matter_id
      AND profiles.user_id = (select auth.uid())
    ) OR
    public.auth_user_class() IN ('admin', 'accounting', 'teamleader')
  );

DROP POLICY "business_select_policy" ON business;
CREATE POLICY "business_select_policy" ON business
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matters
      JOIN profiles ON profiles.id = matters.user_id
      WHERE matters.id = business.matter_id
      AND profiles.user_id = (select auth.uid())
    ) OR
    public.auth_user_class() IN ('admin', 'accounting', 'teamleader')
  );

-- ===== recurring_costs / extra_entries =====
DROP POLICY "recurring_costs_select_policy" ON recurring_costs;
CREATE POLICY "recurring_costs_select_policy" ON recurring_costs
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting', 'teamleader'));

DROP POLICY "extra_entries_select_policy" ON extra_entries;
CREATE POLICY "extra_entries_select_policy" ON extra_entries
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting', 'teamleader'));

-- ===== profit_loss_adjustments / profit_loss_labels =====
-- The policies keep calling these functions; only the body changes.
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
  SELECT public.auth_user_class() IN ('admin', 'accounting', 'teamleader')
$$;

COMMENT ON FUNCTION private.can_view_pl_adjustment(bigint, bigint, bigint) IS
  '損益調整（profit_loss_adjustments）の SELECT 判定。経理・管理者・チームリーダーは全行 true（チームリーダーは他チームとの比較・全体把握のため。migration 40）。詳細: docs/database.md 5.12';

CREATE OR REPLACE FUNCTION private.can_view_pl_label(
  p_matter_id bigint,
  p_business_id bigint,
  p_cost_id bigint,
  p_recurring_cost_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT public.auth_user_class() IN ('admin', 'accounting', 'teamleader')
$$;

COMMENT ON FUNCTION private.can_view_pl_label(bigint, bigint, bigint, bigint) IS
  '損益計算書の表示タイトル（profit_loss_labels）の SELECT 判定。経理・管理者・チームリーダーは全行 true（チームリーダーは他チームとの比較・全体把握のため。migration 40）。詳細: docs/database.md 5.13';

-- Team / creator lookups only served the per-team visibility above.
DROP FUNCTION private.pl_adjustment_team(bigint, bigint, bigint);
DROP FUNCTION private.pl_label_team(bigint, bigint, bigint, bigint);
DROP FUNCTION private.pl_label_matter_user(bigint, bigint, bigint);

-- ===== profit_loss_closing_lines =====
DROP POLICY "profit_loss_closing_lines_select_policy" ON profit_loss_closing_lines;
CREATE POLICY "profit_loss_closing_lines_select_policy" ON profit_loss_closing_lines
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting', 'teamleader'));
