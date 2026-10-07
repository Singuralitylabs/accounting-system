-- Teamleader becomes a flag (profiles.is_teamleader) instead of a profiles.class value, so a
-- teamleader can also be accounting / admin. class is now public / accounting / admin.
-- Effective roles = class + (teamleader if is_teamleader). Teamleader privileges are unchanged:
-- own team for writes, all teams for the read-only widenings of migrations 38 / 40.

-- ===== 1. Column and data migration =====
ALTER TABLE public.profiles ADD COLUMN is_teamleader boolean NOT NULL DEFAULT false;

UPDATE public.profiles SET is_teamleader = true, class = 'public' WHERE class = 'teamleader';

-- ===== 2. Helper =====
CREATE OR REPLACE FUNCTION public.auth_user_is_teamleader()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT is_teamleader FROM public.profiles WHERE user_id = (select auth.uid()) LIMIT 1),
    false
  )
$$;

REVOKE EXECUTE ON FUNCTION public.auth_user_is_teamleader() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_user_is_teamleader() TO authenticated;

-- ===== 3. profiles policies =====
DROP POLICY "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.auth_user_class() IN ('admin', 'accounting')
    OR (
      public.auth_user_is_teamleader()
      AND public.auth_user_team() IS NOT NULL
      AND profiles.team = public.auth_user_team()
    )
  );

-- Non-admins cannot change their own is_teamleader flag.
DROP POLICY "Users can update own profile or admin can update any profile" ON profiles;
CREATE POLICY "Users can update own profile or admin can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.auth_user_class() = 'admin'
  )
  WITH CHECK (
    public.auth_user_class() = 'admin'
    OR (
      user_id = (select auth.uid())
      AND class IS NOT DISTINCT FROM public.auth_user_class()
      AND team  IS NOT DISTINCT FROM public.auth_user_team()
      AND is_teamleader IS NOT DISTINCT FROM public.auth_user_is_teamleader()
    )
  );

-- ===== 4. Budget declarations =====
CREATE OR REPLACE FUNCTION public.can_access_team_budget(target_team text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT public.auth_user_class() IN ('admin', 'accounting')
      OR (
        public.auth_user_is_teamleader()
        AND public.auth_user_team() IS NOT NULL
        AND target_team = public.auth_user_team()
      )
$$;

DROP POLICY "budget_declaration_closings_select_policy" ON budget_declaration_closings;
CREATE POLICY "budget_declaration_closings_select_policy" ON budget_declaration_closings
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting') OR public.auth_user_is_teamleader());

DROP POLICY "budget_declarations_select_policy" ON budget_declarations;
CREATE POLICY "budget_declarations_select_policy" ON budget_declarations
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting') OR public.auth_user_is_teamleader());

DROP POLICY "budget_declaration_items_select_policy" ON budget_declaration_items;
CREATE POLICY "budget_declaration_items_select_policy" ON budget_declaration_items
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting') OR public.auth_user_is_teamleader());

CREATE OR REPLACE FUNCTION public.get_member_options()
RETURNS TABLE(id bigint, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profiles.id, profiles.name FROM public.profiles
  WHERE (public.auth_user_class() IN ('accounting', 'admin') OR public.auth_user_is_teamleader())
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
  WHERE (public.auth_user_class() IN ('accounting', 'admin') OR public.auth_user_is_teamleader())
    AND profiles.id = ANY(target_ids)
$$;

-- ===== 5. Profit and loss (migration 40) =====
DROP POLICY "matters_select_policy" ON matters;
CREATE POLICY "matters_select_policy" ON matters
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = matters.user_id
      AND profiles.user_id = (select auth.uid())
    ) OR
    public.auth_user_class() IN ('admin', 'accounting') OR
    public.auth_user_is_teamleader()
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
    public.auth_user_class() IN ('admin', 'accounting') OR
    public.auth_user_is_teamleader()
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
    public.auth_user_class() IN ('admin', 'accounting') OR
    public.auth_user_is_teamleader()
  );

DROP POLICY "recurring_costs_select_policy" ON recurring_costs;
CREATE POLICY "recurring_costs_select_policy" ON recurring_costs
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting') OR public.auth_user_is_teamleader());

DROP POLICY "extra_entries_select_policy" ON extra_entries;
CREATE POLICY "extra_entries_select_policy" ON extra_entries
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting') OR public.auth_user_is_teamleader());

DROP POLICY "profit_loss_closing_lines_select_policy" ON profit_loss_closing_lines;
CREATE POLICY "profit_loss_closing_lines_select_policy" ON profit_loss_closing_lines
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting') OR public.auth_user_is_teamleader());

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
  SELECT public.auth_user_class() IN ('admin', 'accounting') OR public.auth_user_is_teamleader()
$$;

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
  SELECT public.auth_user_class() IN ('admin', 'accounting') OR public.auth_user_is_teamleader()
$$;

-- ===== 6. update_profiles: class has 3 values, is_teamleader is updatable =====
DROP FUNCTION public.update_profiles(jsonb);

CREATE FUNCTION public.update_profiles(p_updates jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_expected integer;
  v_total integer;
BEGIN
  IF p_updates IS NULL THEN
    RETURN;
  END IF;
  IF jsonb_typeof(p_updates) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_updates) = 0 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_updates) AS e(elem)
    WHERE jsonb_typeof(e.elem) <> 'object'
      OR NOT (e.elem ?& ARRAY['id', 'class', 'is_teamleader', 'team', 'slack_id'])
      OR jsonb_typeof(e.elem -> 'id') <> 'number'
      OR (e.elem ->> 'id') !~ '^[1-9][0-9]{0,18}$'
      OR (
        length(e.elem ->> 'id') = 19
        AND (e.elem ->> 'id') COLLATE "C" > '9223372036854775807'
      )
      OR jsonb_typeof(e.elem -> 'class') <> 'string'
      OR (e.elem ->> 'class') NOT IN ('public', 'accounting', 'admin')
      OR jsonb_typeof(e.elem -> 'is_teamleader') <> 'boolean'
      OR jsonb_typeof(e.elem -> 'team') NOT IN ('string', 'null')
      OR jsonb_typeof(e.elem -> 'slack_id') NOT IN ('string', 'null')
  ) THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), count(DISTINCT u.id) INTO v_total, v_expected
  FROM jsonb_to_recordset(p_updates) AS u(id bigint);
  IF v_total <> v_expected THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles p SET
    class = u.class,
    is_teamleader = u.is_teamleader,
    team = u.team,
    slack_id = u.slack_id,
    updated_at = now()
  FROM jsonb_to_recordset(p_updates) AS u(
    id bigint, class text, is_teamleader boolean, team text, slack_id text
  )
  WHERE p.id = u.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count < v_expected THEN
    RAISE EXCEPTION 'NOT_APPLIED';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_profiles(jsonb) IS
  '管理画面のユーザーリストの一括保存（class / is_teamleader / team / slack_id）を単一トランザクションで行う。SECURITY INVOKER で profiles の RLS（他人の行の更新は admin のみ）をそのまま適用し、RLS で弾かれた・存在しない行があって更新が指定件数に満たなければ NOT_APPLIED、キーの欠落・id の重複や null・許可値以外の class・boolean でない is_teamleader 等の不正な入力は INVALID_INPUT（22023）で全体をロールバックする。詳細: docs/database.md 5.1';

REVOKE EXECUTE ON FUNCTION public.update_profiles(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_profiles(jsonb) TO authenticated;

-- ===== 7. Custom Access Token Hook: user_is_teamleader claim =====
GRANT SELECT (is_teamleader) ON TABLE public.profiles TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  claims jsonb;
  user_class text;
  user_is_teamleader boolean;
BEGIN
  SELECT class, is_teamleader INTO user_class, user_is_teamleader
  FROM public.profiles
  WHERE user_id = (event->>'user_id')::uuid;

  claims := COALESCE(event->'claims', '{}'::jsonb);

  -- jsonb_set on a non-object claims raises; return the event untouched (same fail-safe as below).
  IF jsonb_typeof(claims) IS DISTINCT FROM 'object' THEN
    RAISE WARNING 'custom_access_token_hook: claims is not an object (%) for user_id=%, skipping',
      jsonb_typeof(claims), event->>'user_id';
    RETURN event;
  END IF;

  claims := jsonb_set(claims, '{user_class}', COALESCE(to_jsonb(user_class), 'null'::jsonb));
  claims := jsonb_set(claims, '{user_is_teamleader}', COALESCE(to_jsonb(user_is_teamleader), 'null'::jsonb));

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
EXCEPTION WHEN OTHERS THEN
  -- Never fail token issuance; middleware falls back to a profiles query when the claims are missing.
  RAISE WARNING 'custom_access_token_hook failed for user_id=%: % (SQLSTATE %)',
    event->>'user_id', SQLERRM, SQLSTATE;
  RETURN event;
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'JWT 発行/リフレッシュ時に profiles.class / is_teamleader を user_class / user_is_teamleader クレームとして付与する（Custom Access Token Hook）。詳細: docs/database.md 7章';
