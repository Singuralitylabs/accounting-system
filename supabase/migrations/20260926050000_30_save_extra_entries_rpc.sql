-- 経理追加収支の一括保存（追加・更新・削除）を 1 トランザクションで行う RPC
--
-- 経理追加収支画面（/extra-entries）の一括保存は、これまで INSERT / UPDATE / DELETE を
-- PostgREST へ並列に送っていたため、途中で 1 つが失敗すると（保存前の確認の後に月が確定された、
-- 他の利用者が同じ行を削除した等）、先に成功した操作だけがコミットされた「一部のみ反映」の
-- 状態が残り得た。本関数で 1 回の呼び出し（= 1 トランザクション）にまとめ、途中で失敗した
-- 場合はすべてロールバックする。
--
-- SECURITY INVOKER（既定）にし、extra_entries の RLS（書き込みは accounting / admin のみ・
-- 確定済みの月の編集ロック。migration 14 / 27）をそのまま適用する。
-- RLS の USING で弾かれた UPDATE / DELETE はエラーにならず 0 行になるだけのため、
-- 更新・削除した行数を数え、指定した件数に満たなければ NOT_APPLIED を投げて全体を
-- ロールバックする（INSERT と UPDATE の WITH CHECK 違反は RLS のエラーになりロールバックされる）。
--
-- p_inserts: 追加する行の配列（キーは extra_entries の列名。id は含めない）
-- p_updates: 更新する行の配列（id と更新後の各列）
-- p_delete_ids: 削除する行の id
-- 各列の値の整合（収入 / 支出ごとの項目）は呼び出し側（app/utils/extraEntry.ts の
-- toExtraEntryDbRow）で揃え、extra_entries_type_fields_check でも担保する。
CREATE OR REPLACE FUNCTION public.save_extra_entries(
  p_inserts jsonb,
  p_updates jsonb,
  p_delete_ids bigint[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_expected integer;
BEGIN
  IF COALESCE(array_length(p_delete_ids, 1), 0) > 0 THEN
    SELECT count(DISTINCT d) INTO v_expected FROM unnest(p_delete_ids) AS d;
    DELETE FROM public.extra_entries WHERE id = ANY (p_delete_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count < v_expected THEN
      RAISE EXCEPTION 'NOT_APPLIED';
    END IF;
  END IF;

  IF COALESCE(jsonb_array_length(p_updates), 0) > 0 THEN
    SELECT count(DISTINCT u.id) INTO v_expected
    FROM jsonb_to_recordset(p_updates) AS u(id bigint);
    UPDATE public.extra_entries e SET
      entry_type = u.entry_type,
      category = u.category,
      entry_date = u.entry_date,
      invoice_number = u.invoice_number,
      description = u.description,
      billing_target = u.billing_target,
      manager_id = u.manager_id,
      team = u.team,
      billing_amount = u.billing_amount,
      expense_amount = u.expense_amount,
      payment_method = u.payment_method
    FROM jsonb_to_recordset(p_updates) AS u(
      id bigint, entry_type text, category text, entry_date date,
      invoice_number text, description text, billing_target text,
      manager_id bigint, team text, billing_amount numeric,
      expense_amount numeric, payment_method text
    )
    WHERE e.id = u.id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count < v_expected THEN
      RAISE EXCEPTION 'NOT_APPLIED';
    END IF;
  END IF;

  IF COALESCE(jsonb_array_length(p_inserts), 0) > 0 THEN
    INSERT INTO public.extra_entries
      (entry_type, category, entry_date, invoice_number, description,
       billing_target, manager_id, team, billing_amount, expense_amount,
       payment_method)
    SELECT
      i.entry_type, i.category, i.entry_date, i.invoice_number, i.description,
      i.billing_target, i.manager_id, i.team, i.billing_amount,
      i.expense_amount, i.payment_method
    FROM jsonb_to_recordset(p_inserts) AS i(
      entry_type text, category text, entry_date date, invoice_number text,
      description text, billing_target text, manager_id bigint, team text,
      billing_amount numeric, expense_amount numeric, payment_method text
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.save_extra_entries(jsonb, jsonb, bigint[]) IS
  '経理追加収支の一括保存（追加・更新・削除）を単一トランザクションで行う。SECURITY INVOKER で extra_entries の RLS（書き込みは accounting / admin のみ・確定済みの月の編集ロック）をそのまま適用し、RLS で弾かれて更新・削除が指定件数に満たなければ NOT_APPLIED で全体をロールバックする。詳細: docs/database.md 5.7';

-- Supabase の既定の権限（public スキーマの関数は anon にも EXECUTE が付く）を外し、
-- ログインユーザーだけが呼べるようにする（書き込みの可否は RLS が判定する）
REVOKE EXECUTE ON FUNCTION public.save_extra_entries(jsonb, jsonb, bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_extra_entries(jsonb, jsonb, bigint[]) TO authenticated;
