-- copy_extra_entries の同一内容の判定を、すべての比較列で NULL 同士も一致とみなす形にそろえる（Issue #188）
--
-- migration 35 の NOT EXISTS 句は、team / billing_amount / expense_amount を
-- IS NOT DISTINCT FROM（NULL 同士は一致）、entry_type / category / description / manager_id を
-- =（NULL 同士は一致しない）で比較していた。後者は現状 NOT NULL 列なので正しく動くが、その前提に
-- 暗黙に依存しており、将来いずれかを NULL 許容に変えると、その列が NULL の行が重複と判定されず、
-- エラーも出ないまま二重登録防止が効かなくなる。
-- すべて IS NOT DISTINCT FROM にそろえ、列の NULL 許容に左右されない判定にする（現状の NOT NULL 列
-- では挙動は変わらない）。関数のシグネチャ・権限・それ以外の処理は migration 35 と同一。
--
-- 詳細設計: docs/database.md 5.7

CREATE OR REPLACE FUNCTION public.copy_extra_entries(
  p_target_month date,
  p_rows jsonb
)
RETURNS TABLE (inserted_count integer, skipped_count integer)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_month date;
  v_next date;
  v_total integer;
  v_inserted integer;
BEGIN
  IF public.auth_user_class() IS NULL
     OR public.auth_user_class() NOT IN ('admin', 'accounting') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_target_month IS NULL
    OR p_rows IS NULL
    OR pg_catalog.jsonb_typeof(p_rows) <> 'array'
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_rows) AS e
      WHERE pg_catalog.jsonb_typeof(e) <> 'object'
    )
  THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  v_month := pg_catalog.date_trunc('month', p_target_month)::date;
  v_next := (v_month + interval '1 month')::date;
  v_total := pg_catalog.jsonb_array_length(p_rows);
  IF v_total = 0 THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_to_recordset(p_rows) AS r(entry_date date)
    WHERE r.entry_date IS NULL OR r.entry_date < v_month OR r.entry_date >= v_next
  ) THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023',
      DETAIL = 'entry_date はすべてコピー先の月内の日付にしてください';
  END IF;

  PERFORM private.lock_extra_entries_copy(v_month);

  -- ロックの取得とは別の文で確認する（新しいスナップショットで、ロック待ちの間に
  -- コミットされた他のコピーの行を見る）
  INSERT INTO public.extra_entries
    (entry_type, category, entry_date, invoice_number, description,
     billing_target, manager_id, team, billing_amount, expense_amount,
     payment_method)
  SELECT
    r.entry_type, r.category, r.entry_date, r.invoice_number, r.description,
    r.billing_target, r.manager_id, r.team, r.billing_amount,
    r.expense_amount, r.payment_method
  FROM pg_catalog.jsonb_to_recordset(p_rows) AS r(
    entry_type text, category text, entry_date date, invoice_number text,
    description text, billing_target text, manager_id bigint, team text,
    billing_amount numeric, expense_amount numeric, payment_method text
  )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.extra_entries AS e
    WHERE e.entry_date >= v_month
      AND e.entry_date < v_next
      AND e.entry_type IS NOT DISTINCT FROM r.entry_type
      AND e.category IS NOT DISTINCT FROM r.category
      AND e.description IS NOT DISTINCT FROM r.description
      AND e.manager_id IS NOT DISTINCT FROM r.manager_id
      AND e.team IS NOT DISTINCT FROM r.team
      AND e.billing_amount IS NOT DISTINCT FROM r.billing_amount
      AND e.expense_amount IS NOT DISTINCT FROM r.expense_amount
  );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN QUERY SELECT v_inserted, v_total - v_inserted;
END;
$$;

COMMENT ON FUNCTION public.copy_extra_entries(date, jsonb) IS
  '経理追加収支の前月コピー。対象月の排他 advisory lock（private.lock_extra_entries_copy）を取ってから、当月に同一内容の行が無いものだけを INSERT する（同時実行による二重登録の防止）。SECURITY INVOKER で extra_entries の RLS と確定との直列化トリガーをそのまま適用する。詳細: docs/database.md 5.7';

-- Supabase の既定の権限（public スキーマの関数は anon にも EXECUTE が付く）を外し、
-- ログインユーザーだけが呼べるようにする（書き込みの可否は RLS が判定する）
REVOKE EXECUTE ON FUNCTION public.copy_extra_entries(date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_extra_entries(date, jsonb) TO authenticated;
