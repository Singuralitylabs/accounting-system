-- Budget declaration: explicit completion ("申告済み" checkbox)
--
--   1. budget_declarations.completed_at / completed_by: a declaration counts as declared only while
--      completed_at IS NOT NULL. A header row without completion is "in progress".
--   2. Existing rows are backfilled as completed so past / closed months do not flip to "in progress".
--   3. save_budget_declaration gets p_completed and updates completion in the same transaction.
-- Design: docs/database.md 3.9 / 5.9

-- ===== 1. Columns =====
ALTER TABLE budget_declarations
  ADD COLUMN completed_at timestamptz NULL,
  ADD COLUMN completed_by bigint NULL REFERENCES profiles (id);

COMMENT ON COLUMN budget_declarations.completed_at IS '申告完了日時。NULL = 入力中、値あり = 申告済み。save_budget_declaration が p_completed に応じて設定する';
COMMENT ON COLUMN budget_declarations.completed_by IS '申告を完了にした利用者（profiles.id）。auth.uid() から解決しクライアントからは受け取らない。completed_at と同時に NULL / 非 NULL になる';

CREATE INDEX IF NOT EXISTS idx_budget_declarations_completed_by
  ON budget_declarations (completed_by);

-- ===== 2. Backfill =====
-- Runs as the table owner, so RLS and the closed-month guard (row_security_active = false) do not
-- apply; the triggers are still disabled explicitly so closed months are updated regardless and
-- updated_at keeps its original value.
ALTER TABLE budget_declarations DISABLE TRIGGER update_budget_declarations_updated_at;
ALTER TABLE budget_declarations DISABLE TRIGGER guard_budget_closed_month_budget_declarations;

UPDATE budget_declarations
SET completed_at = updated_at,
    completed_by = declared_by
WHERE completed_at IS NULL;

ALTER TABLE budget_declarations ENABLE TRIGGER update_budget_declarations_updated_at;
ALTER TABLE budget_declarations ENABLE TRIGGER guard_budget_closed_month_budget_declarations;

ALTER TABLE budget_declarations
  ADD CONSTRAINT budget_declarations_completion_check
  CHECK ((completed_at IS NULL) = (completed_by IS NULL));

-- ===== 3. save_budget_declaration with p_completed =====
-- The signature changes, so the old overload is dropped (otherwise PostgREST sees two candidates).
-- p_completed DEFAULT NULL = leave completion unchanged (a new declaration stays in progress), so a
-- caller that has not been updated yet keeps working between `supabase db push` and the app deploy.
-- Apply the migration first, then deploy the app: the new app calls with p_completed, which the
-- old function does not accept.
DROP FUNCTION public.save_budget_declaration(date, text, jsonb, bigint, text);

CREATE OR REPLACE FUNCTION public.save_budget_declaration(
  p_target_month date,
  p_team text,
  p_items jsonb,
  p_declaration_id bigint DEFAULT NULL,
  p_comment text DEFAULT NULL,
  p_completed boolean DEFAULT NULL
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
    -- completed_by comes from auth.uid(), never from the client.
    INSERT INTO public.budget_declarations
      (target_month, team, declared_by, comment, completed_at, completed_by)
    VALUES (
      p_target_month, p_team, v_declared_by, p_comment,
      CASE WHEN p_completed IS TRUE THEN pg_catalog.now() END,
      CASE WHEN p_completed IS TRUE THEN v_declared_by END
    )
    RETURNING budget_declarations.id INTO v_declaration_id;
  ELSE
    -- Also match team and target_month: the form fixes both on edit, so this only guards against
    -- an id pointing at another team's / month's declaration (RLS enforces team access itself).
    -- Completion: TRUE keeps an existing completed_at / completed_by (re-saving a completed
    -- declaration does not move the completion time) and sets them when it was in progress;
    -- FALSE clears both; NULL leaves them unchanged.
    UPDATE public.budget_declarations
    SET declared_by = v_declared_by,
        comment = p_comment,
        completed_at = CASE
          WHEN p_completed IS NULL THEN budget_declarations.completed_at
          WHEN p_completed THEN coalesce(budget_declarations.completed_at, pg_catalog.now())
          ELSE NULL
        END,
        completed_by = CASE
          WHEN p_completed IS NULL THEN budget_declarations.completed_by
          WHEN p_completed THEN coalesce(budget_declarations.completed_by, v_declared_by)
          ELSE NULL
        END
    WHERE budget_declarations.id = p_declaration_id
      AND budget_declarations.team = p_team
      AND budget_declarations.target_month = p_target_month
    RETURNING budget_declarations.id INTO v_declaration_id;

    -- RLS hiding the row or a prior delete yields 0 rows, not an error, so raise explicitly.
    -- Use SQLSTATE P0002 (no_data_found) so the app can branch on error.code, not message text.
    IF v_declaration_id IS NULL THEN
      RAISE EXCEPTION 'DECLARATION_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Replace lines: delete all, then insert the submitted ones (no-op delete for a new declaration).
  DELETE FROM public.budget_declaration_items
  WHERE declaration_id = v_declaration_id;

  -- entry_type is under a CHECK, so trim surrounding whitespace before inserting.
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

COMMENT ON FUNCTION public.save_budget_declaration(date, text, jsonb, bigint, text, boolean) IS
  '事前収支申告の作成・編集（ヘッダ + 明細差し替え + 申告完了）を単一トランザクションで行う。p_declaration_id が null なら新規作成、それ以外なら既存ヘッダの更新（team・target_month も一致する場合のみ）。明細は既存を全削除してから p_items を全登録する。p_completed = true で申告済み（既に完了済みなら completed_at を保持）、false で入力中に戻す、null は変更なし。declared_by / completed_by は auth.uid() から解決しクライアントからは受け取らない。対象月が確定済みなら MONTH_CLOSED（SQLSTATE 42501）で拒否する。書き込みの可否は呼び出し元ロールの RLS がそのまま適用される（SECURITY INVOKER）。詳細: docs/database.md';

REVOKE EXECUTE ON FUNCTION public.save_budget_declaration(date, text, jsonb, bigint, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_budget_declaration(date, text, jsonb, bigint, text, boolean) TO authenticated;
