-- save_budget_recurring_items: bulk save of budget_recurring_items in one transaction.
-- A concurrent change to a row the user edited or deleted aborts the whole call
-- (RAISE), so a conflict always means "nothing was saved".
--
-- p_rows: [{"state": "new" | "edited" | "removed" | "keep", "id": 1, "updated_at": "...", "team": "...",
--           "entry_type": "...", "category": "...", "description": "...", "amount": 1000,
--           "manager_id": null, "start_month": "2026-10-01", "end_month": null, "display_order": 0}, ...]
--   new     INSERT (id / updated_at ignored).
--   edited  UPDATE all columns; the row must exist and updated_at must equal the value the user saw.
--   removed DELETE; same updated_at condition. A row already deleted by someone else is ignored.
--   keep    untouched row sent only to renumber display_order; ignored when it changed or vanished.
-- SECURITY INVOKER: RLS (can_access_team_budget) applies to every write.
CREATE OR REPLACE FUNCTION public.save_budget_recurring_items(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  r record;
  cur record;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array' USING ERRCODE = '22023';
  END IF;

  -- Row locks are taken in id order so concurrent saves cannot deadlock. FOR UPDATE re-reads the
  -- latest committed row after waiting, so updated_at below reflects a concurrent save.
  FOR r IN
    SELECT x.*
    FROM jsonb_to_recordset(p_rows) AS x(
      state         text,
      id            bigint,
      updated_at    timestamptz,
      team          text,
      entry_type    text,
      category      text,
      description   text,
      amount        numeric,
      manager_id    bigint,
      start_month   date,
      end_month     date,
      display_order integer
    )
    ORDER BY x.id NULLS LAST
  LOOP
    IF r.state IS NULL OR r.state NOT IN ('new', 'edited', 'removed', 'keep') THEN
      RAISE EXCEPTION 'invalid state: %', r.state USING ERRCODE = '22023';
    END IF;

    IF r.state = 'new' THEN
      INSERT INTO public.budget_recurring_items (
        team, entry_type, category, description, amount, manager_id,
        start_month, end_month, display_order
      ) VALUES (
        r.team, r.entry_type, r.category, r.description, r.amount, r.manager_id,
        r.start_month, r.end_month, r.display_order
      );
      CONTINUE;
    END IF;

    SELECT t.updated_at INTO cur
    FROM public.budget_recurring_items t
    WHERE t.id = r.id
    FOR UPDATE;

    IF NOT FOUND THEN
      -- FOR UPDATE skips rows RLS does not let the caller update, so tell "not writable" (the
      -- SELECT policy still shows it) from "deleted by someone else".
      SELECT t.updated_at INTO cur
      FROM public.budget_recurring_items t
      WHERE t.id = r.id;

      IF FOUND THEN
        IF r.state = 'keep' THEN
          CONTINUE;
        END IF;
        IF cur.updated_at IS DISTINCT FROM r.updated_at THEN
          RAISE EXCEPTION 'BUDGET_RECURRING_ITEMS_CONFLICT' USING ERRCODE = '40001';
        END IF;
        RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
      END IF;

      IF r.state = 'edited' THEN
        RAISE EXCEPTION 'BUDGET_RECURRING_ITEMS_CONFLICT' USING ERRCODE = '40001';
      END IF;
      CONTINUE;
    END IF;

    IF cur.updated_at IS DISTINCT FROM r.updated_at THEN
      IF r.state = 'keep' THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'BUDGET_RECURRING_ITEMS_CONFLICT' USING ERRCODE = '40001';
    END IF;

    IF r.state = 'edited' THEN
      UPDATE public.budget_recurring_items t
      SET team = r.team,
          entry_type = r.entry_type,
          category = r.category,
          description = r.description,
          amount = r.amount,
          manager_id = r.manager_id,
          start_month = r.start_month,
          end_month = r.end_month,
          display_order = r.display_order
      WHERE t.id = r.id;
    ELSIF r.state = 'removed' THEN
      DELETE FROM public.budget_recurring_items t WHERE t.id = r.id;
    ELSE
      UPDATE public.budget_recurring_items t
      SET display_order = r.display_order
      WHERE t.id = r.id
        AND t.display_order IS DISTINCT FROM r.display_order;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.save_budget_recurring_items(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_budget_recurring_items(jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.save_budget_recurring_items(jsonb) IS
  '定期明細の一括保存（1 トランザクション）。編集・削除した行の updated_at が表示時と異なる場合は BUDGET_RECURRING_ITEMS_CONFLICT（SQLSTATE 40001）で全体を中止し、何も保存しない。書き込み権限は SECURITY INVOKER により RLS（can_access_team_budget）が担う。詳細: docs/database.md 5.11';
