-- Budget declarations: every logged-in user can view; anyone with a team can edit their own team.
--   1. SELECT on declarations / items / closings / recurring items opens to all authenticated users.
--   2. can_access_team_budget: accounting / admin (all teams) OR the user's own team, regardless of
--      role (the teamleader condition from migration 41 is removed).
--   3. budget_recurring_items: split the single FOR ALL policy (migration 22) into open SELECT and
--      team-restricted writes.
--   4. get_member_options / validate_member_ids open to every authenticated user (manager picker).
-- Unchanged: budget_declaration_closings INSERT / DELETE and budget_declaration_reminder_days
-- (accounting / admin only); the declared_by = self INSERT condition; month-closed guards.

-- ===== 1. Write access follows the user's own team =====
CREATE OR REPLACE FUNCTION public.can_access_team_budget(target_team text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT public.auth_user_class() IN ('admin', 'accounting')
      OR (
        public.auth_user_team() IS NOT NULL
        AND target_team = public.auth_user_team()
      )
$$;

-- ===== 2. SELECT for every authenticated user =====
DROP POLICY "budget_declarations_select_policy" ON budget_declarations;
CREATE POLICY "budget_declarations_select_policy" ON budget_declarations
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY "budget_declaration_items_select_policy" ON budget_declaration_items;
CREATE POLICY "budget_declaration_items_select_policy" ON budget_declaration_items
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY "budget_declaration_closings_select_policy" ON budget_declaration_closings;
CREATE POLICY "budget_declaration_closings_select_policy" ON budget_declaration_closings
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- ===== 3. budget_recurring_items: open SELECT, team-restricted writes =====
DROP POLICY "budget_recurring_items_all_policy" ON budget_recurring_items;

CREATE POLICY "budget_recurring_items_select_policy" ON budget_recurring_items
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "budget_recurring_items_insert_policy" ON budget_recurring_items
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_team_budget(budget_recurring_items.team));

CREATE POLICY "budget_recurring_items_update_policy" ON budget_recurring_items
  FOR UPDATE TO authenticated
  USING (public.can_access_team_budget(budget_recurring_items.team))
  WITH CHECK (public.can_access_team_budget(budget_recurring_items.team));

CREATE POLICY "budget_recurring_items_delete_policy" ON budget_recurring_items
  FOR DELETE TO authenticated
  USING (public.can_access_team_budget(budget_recurring_items.team));

-- ===== 4. Member picker functions =====
CREATE OR REPLACE FUNCTION public.get_member_options()
RETURNS TABLE(id bigint, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profiles.id, profiles.name FROM public.profiles
  WHERE (select auth.uid()) IS NOT NULL
  ORDER BY profiles.id
$$;

CREATE OR REPLACE FUNCTION public.validate_member_ids(target_ids bigint[])
RETURNS TABLE(id bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profiles.id FROM public.profiles
  WHERE (select auth.uid()) IS NOT NULL
    AND profiles.id = ANY(target_ids)
$$;

COMMENT ON FUNCTION public.get_member_options() IS
  '事前収支申告の明細担当者選択肢（全メンバーの id/name のみ）。profiles の SELECT RLS をバイパスするが、機微情報は返さない。ログイン済みの全ユーザーが呼べる（migration 44）。詳細: docs/database.md';
COMMENT ON FUNCTION public.validate_member_ids(bigint[]) IS
  '渡された id のうち、実在する profiles.id のみを返す（事前収支申告の manager_id 保存前検証用）。ログイン済みの全ユーザーが呼べる（migration 44）。詳細: docs/database.md';
