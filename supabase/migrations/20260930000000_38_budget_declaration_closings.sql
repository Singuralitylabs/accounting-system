-- Budget declaration: all-team read for teamleaders and monthly closing (Issue #222)
--
--   1. SELECT on budget_declarations / budget_declaration_items is opened to every
--      teamleader / accounting / admin (all teams). Writes keep can_access_team_budget.
--   2. budget_declaration_closings: one row per closed month (row exists = closed,
--      reopen = row delete). Independent of profit_loss_closings.
--   3. Closed months reject INSERT / UPDATE / DELETE on declarations and items for every
--      role (RLS condition + BEFORE trigger + save_budget_declaration check).
--   4. Closing and declaration writes are serialized per month by an advisory lock.
-- Design: docs/database.md 3.9 / 3.10 / 5.8 / 5.9

-- ===== 1. Closing table =====
CREATE TABLE budget_declaration_closings (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_month   date NOT NULL,
  closed_by      bigint NOT NULL REFERENCES profiles (id),
  -- Name at closing time: teamleaders cannot read other teams' profiles but still see who closed
  closed_by_name text NOT NULL,
  closed_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT budget_declaration_closings_target_month_check
    CHECK (target_month = date_trunc('month', target_month)::date),
  CONSTRAINT budget_declaration_closings_target_month_key UNIQUE (target_month)
);

COMMENT ON TABLE budget_declaration_closings IS '事前収支申告の月次確定（Issue #222）。1 ヶ月 1 行。行があれば target_month の月は確定済みで、全チームの申告の作成・編集・削除ができない。確定解除は行の削除。損益計算書の月次収支確定（profit_loss_closings）とは独立';

CREATE INDEX IF NOT EXISTS idx_budget_declaration_closings_closed_by
  ON budget_declaration_closings (closed_by);

-- ===== 2. Helpers =====
CREATE OR REPLACE FUNCTION private.is_budget_month_closed(p_month date)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT p_month IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.budget_declaration_closings c
    WHERE c.target_month = date_trunc('month', p_month)::date
  )
$$;

COMMENT ON FUNCTION private.is_budget_month_closed(date) IS
  '指定日の属する月が事前収支申告で確定済みか（Issue #222）。NULL は false。RLS の編集ロックとトリガーから呼ぶ。詳細: docs/database.md 5.8';

REVOKE EXECUTE ON FUNCTION private.is_budget_month_closed(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_budget_month_closed(date) TO authenticated;

-- Lock class 222 (the issue number) keeps this separate from lock_pl_month (148).
CREATE OR REPLACE FUNCTION private.lock_budget_month(p_month date, p_exclusive boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key integer;
BEGIN
  IF p_month IS NULL THEN
    RETURN;
  END IF;
  v_key := extract(year FROM p_month)::integer * 100 + extract(month FROM p_month)::integer;
  IF p_exclusive THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(222, v_key);
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(222, v_key);
  END IF;
END;
$$;

COMMENT ON FUNCTION private.lock_budget_month(date, boolean) IS
  '事前収支申告の月次確定と、同じ月への申告の書き込みを直列化する月単位の advisory lock（Issue #222）。p_exclusive = true は確定用の排他ロック、false は書き込み用の共有ロック。トランザクション終了まで保持。詳細: docs/database.md 5.8';

REVOKE EXECUTE ON FUNCTION private.lock_budget_month(date, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.lock_budget_month(date, boolean) TO authenticated;

-- ===== 3. Closing table RLS / lock trigger =====
ALTER TABLE budget_declaration_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_declaration_closings_select_policy" ON budget_declaration_closings
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting', 'teamleader'));

CREATE POLICY "budget_declaration_closings_insert_policy" ON budget_declaration_closings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_user_class() IN ('admin', 'accounting')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = budget_declaration_closings.closed_by
      AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "budget_declaration_closings_delete_policy" ON budget_declaration_closings
  FOR DELETE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'));

-- Exclusive lock before the closing row becomes visible: declaration writes that hold the shared
-- lock commit first, later ones wait and then see the month as closed.
CREATE OR REPLACE FUNCTION private.lock_budget_closing_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM private.lock_budget_month(NEW.target_month, true);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.lock_budget_closing_insert() FROM PUBLIC;

CREATE TRIGGER lock_budget_closing_insert
    BEFORE INSERT ON budget_declaration_closings
    FOR EACH ROW EXECUTE FUNCTION private.lock_budget_closing_insert();

GRANT SELECT, INSERT, DELETE ON TABLE budget_declaration_closings
  TO authenticated, service_role;
REVOKE ALL ON TABLE budget_declaration_closings FROM anon;

-- ===== 4. Read access for every teamleader =====
DROP POLICY "budget_declarations_select_policy" ON budget_declarations;
CREATE POLICY "budget_declarations_select_policy" ON budget_declarations
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting', 'teamleader'));

-- ===== 5. Write policies with the closed-month lock =====
DROP POLICY "budget_declarations_insert_policy" ON budget_declarations;
DROP POLICY "budget_declarations_update_policy" ON budget_declarations;
DROP POLICY "budget_declarations_delete_policy" ON budget_declarations;

CREATE POLICY "budget_declarations_insert_policy" ON budget_declarations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_team_budget(budget_declarations.team)
    AND NOT private.is_budget_month_closed(budget_declarations.target_month)
    AND (
      public.auth_user_class() IN ('admin', 'accounting')
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = budget_declarations.declared_by
        AND p.user_id = (select auth.uid())
      )
    )
  );

CREATE POLICY "budget_declarations_update_policy" ON budget_declarations
  FOR UPDATE TO authenticated
  USING (
    public.can_access_team_budget(budget_declarations.team)
    AND NOT private.is_budget_month_closed(budget_declarations.target_month)
  )
  WITH CHECK (
    public.can_access_team_budget(budget_declarations.team)
    AND NOT private.is_budget_month_closed(budget_declarations.target_month)
  );

CREATE POLICY "budget_declarations_delete_policy" ON budget_declarations
  FOR DELETE TO authenticated
  USING (
    public.can_access_team_budget(budget_declarations.team)
    AND NOT private.is_budget_month_closed(budget_declarations.target_month)
  );

-- Items: the single FOR ALL policy is split because SELECT is now wider than writes.
DROP POLICY "budget_declaration_items_all_policy" ON budget_declaration_items;

CREATE POLICY "budget_declaration_items_select_policy" ON budget_declaration_items
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting', 'teamleader'));

CREATE POLICY "budget_declaration_items_insert_policy" ON budget_declaration_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM budget_declarations d
      WHERE d.id = budget_declaration_items.declaration_id
      AND public.can_access_team_budget(d.team)
      AND NOT private.is_budget_month_closed(d.target_month)
    )
  );

CREATE POLICY "budget_declaration_items_update_policy" ON budget_declaration_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM budget_declarations d
      WHERE d.id = budget_declaration_items.declaration_id
      AND public.can_access_team_budget(d.team)
      AND NOT private.is_budget_month_closed(d.target_month)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM budget_declarations d
      WHERE d.id = budget_declaration_items.declaration_id
      AND public.can_access_team_budget(d.team)
      AND NOT private.is_budget_month_closed(d.target_month)
    )
  );

CREATE POLICY "budget_declaration_items_delete_policy" ON budget_declaration_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM budget_declarations d
      WHERE d.id = budget_declaration_items.declaration_id
      AND public.can_access_team_budget(d.team)
      AND NOT private.is_budget_month_closed(d.target_month)
    )
  );

-- ===== 6. Write guard trigger (serialization with closing) =====
-- RLS alone cannot serialize: a write that passed the policy before a concurrent closing
-- committed would still land in a closed month. The trigger takes the shared month lock first
-- and re-checks after acquiring it. Users without RLS applied (postgres / service_role) are exempt.
CREATE OR REPLACE FUNCTION private.guard_budget_closed_month_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_months date[] := '{}';
  v_month date;
BEGIN
  IF NOT pg_catalog.row_security_active(TG_RELID) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'budget_declarations' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_months := v_months || OLD.target_month;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_months := v_months || NEW.target_month;
    END IF;
  ELSE
    -- Items carry no month; resolve via the parent. A missing parent (cascade from a header
    -- delete) is already guarded by the header trigger.
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_months := v_months || ARRAY(
        SELECT d.target_month FROM public.budget_declarations d WHERE d.id = OLD.declaration_id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_months := v_months || ARRAY(
        SELECT d.target_month FROM public.budget_declarations d WHERE d.id = NEW.declaration_id);
    END IF;
  END IF;

  SELECT coalesce(array_agg(DISTINCT m ORDER BY m), '{}') INTO v_months
  FROM unnest(v_months) AS m
  WHERE m IS NOT NULL;

  -- Ascending order avoids lock-order deadlocks between two-month UPDATEs.
  FOREACH v_month IN ARRAY v_months LOOP
    PERFORM private.lock_budget_month(v_month, false);
  END LOOP;

  FOREACH v_month IN ARRAY v_months LOOP
    IF private.is_budget_month_closed(v_month) THEN
      RAISE EXCEPTION 'MONTH_CLOSED'
        USING ERRCODE = '42501',
              DETAIL = pg_catalog.format('%s の月は確定済みのため変更できません（%s）',
                                         pg_catalog.to_char(v_month, 'YYYY-MM'), TG_TABLE_NAME);
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.guard_budget_closed_month_write() IS
  '事前収支申告（ヘッダ・明細）の書き込みトリガー（Issue #222）。RLS が適用される利用者の書き込みについて、対象月の共有ロック（private.lock_budget_month）を取り、取得後に確定済みなら MONTH_CLOSED（SQLSTATE 42501）で拒否する。確定の排他ロックと直列化する。詳細: docs/database.md 5.8';

REVOKE EXECUTE ON FUNCTION private.guard_budget_closed_month_write() FROM PUBLIC;

CREATE TRIGGER guard_budget_closed_month_budget_declarations
    BEFORE INSERT OR UPDATE OR DELETE ON budget_declarations
    FOR EACH ROW EXECUTE FUNCTION private.guard_budget_closed_month_write();

CREATE TRIGGER guard_budget_closed_month_budget_declaration_items
    BEFORE INSERT OR UPDATE OR DELETE ON budget_declaration_items
    FOR EACH ROW EXECUTE FUNCTION private.guard_budget_closed_month_write();

-- ===== 7. save_budget_declaration: explicit MONTH_CLOSED =====
-- Same body as migration 24 plus the lock / closed check up front, so the caller gets a
-- distinguishable error instead of a generic RLS failure.
CREATE OR REPLACE FUNCTION public.save_budget_declaration(
  p_target_month date,
  p_team text,
  p_items jsonb,
  p_declaration_id bigint DEFAULT NULL,
  p_comment text DEFAULT NULL
)
RETURNS TABLE (id bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_declaration_id bigint;
  v_declared_by bigint;
BEGIN
  SELECT p.id INTO v_declared_by FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_declared_by IS NULL THEN
    RAISE EXCEPTION 'プロフィールが見つかりません';
  END IF;

  PERFORM private.lock_budget_month(p_target_month, false);
  IF private.is_budget_month_closed(p_target_month) THEN
    RAISE EXCEPTION 'MONTH_CLOSED' USING ERRCODE = '42501';
  END IF;

  IF p_declaration_id IS NULL THEN
    INSERT INTO public.budget_declarations (target_month, team, declared_by, comment)
    VALUES (p_target_month, p_team, v_declared_by, p_comment)
    RETURNING budget_declarations.id INTO v_declaration_id;
  ELSE
    UPDATE public.budget_declarations
    SET declared_by = v_declared_by, comment = p_comment
    WHERE budget_declarations.id = p_declaration_id
      AND budget_declarations.team = p_team
      AND budget_declarations.target_month = p_target_month
    RETURNING budget_declarations.id INTO v_declaration_id;

    IF v_declaration_id IS NULL THEN
      RAISE EXCEPTION 'DECLARATION_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  DELETE FROM public.budget_declaration_items
  WHERE declaration_id = v_declaration_id;

  INSERT INTO public.budget_declaration_items
    (declaration_id, entry_type, category, description, amount, manager_id, display_order)
  SELECT
    v_declaration_id,
    btrim(item ->> 'entry_type'),
    btrim(item ->> 'category'),
    btrim(item ->> 'description'),
    (item ->> 'amount')::numeric,
    (item ->> 'manager_id')::bigint,
    ordinality - 1
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(item, ordinality);

  RETURN QUERY SELECT v_declaration_id;
END;
$$;

COMMENT ON FUNCTION public.save_budget_declaration(date, text, jsonb, bigint, text) IS
  '事前収支申告の作成・編集（ヘッダ + 明細差し替え）を単一トランザクションで行う。p_declaration_id が null なら新規作成、それ以外なら既存ヘッダの更新（team・target_month も一致する場合のみ）。明細は既存を全削除してから p_items を全登録する。declared_by は auth.uid() から解決しクライアントからは受け取らない。対象月が確定済みなら MONTH_CLOSED（SQLSTATE 42501）で拒否する（Issue #222）。書き込みの可否は呼び出し元ロールの RLS がそのまま適用される（SECURITY INVOKER）。詳細: docs/database.md';
