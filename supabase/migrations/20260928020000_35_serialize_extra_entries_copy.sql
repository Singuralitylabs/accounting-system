-- 経理追加収支の前月コピーを対象月ごとに直列化し、同時実行による二重登録を防ぐ
--
-- 前月コピー（損益計算書 月次タブの「前月の経理追加収支をコピー」）は、これまでアプリ側
-- （app/utils/supabase/extraEntries.ts の copyExtraEntriesFromPreviousMonth）で
-- 「当月の既存行を読んで同一内容の行を除く → 残りを INSERT する」を別々のリクエスト
-- （= 別々のトランザクション）で行っていた。2 つの手順の間に排他が無いため、2 人の経理担当が
-- 同じ月を同時にコピーすると、次の順序で同じ行が二重に登録された:
--   1. A が当月の既存行を読む（まだ無い）
--   2. B が当月の既存行を読む（まだ無い）
--   3. A が前月分を INSERT する
--   4. B も前月分を INSERT する（A の分と同一内容の行が二重になる）
-- 確定との直列化（migration 34、Issue #171）の月ロックは書き込み側が共有ロックのため、
-- コピー同士は直列化されない。
--
-- 対策: 既存行の確認から INSERT までを 1 つの関数（= 1 トランザクション）にまとめ、
-- 対象月ごとの排他 advisory lock を取ってから既存行を確認する。後から来たコピーは先のコピーの
-- コミット（またはロールバック）まで待ち、ロック取得後の確認で先のコピーが登録した行を
-- 同一内容として除く。
--
-- 一意制約（部分インデックス + ON CONFLICT DO NOTHING）にしない理由: 同一内容の明細
-- （同じ日の交通費 2 件など）は正当に存在し得る。前月に同一内容の行が複数あればすべて
-- コピーする仕様（アプリ側の従来の挙動）であり、利用者が同一内容の行を手で追加することも
-- できるため、重複判定のキーは一意ではない。既存データにある同一内容の行もそのまま残せる。
--
-- ロック取得後の確認が先のコピーのコミットを見られるのは、READ COMMITTED で VOLATILE な
-- plpgsql 関数が文ごとに新しいスナップショットを取るため（ロックの取得と、確認を含む INSERT を
-- 別の文にしている。migration 34 と同じ前提）。PostgREST のトランザクションは READ COMMITTED
-- （既定）であることを前提にする。
--
-- 詳細設計: docs/database.md 5.7

-- ===== 前月コピー用の月単位の advisory lock =====
-- 第 1 キーは本機能の名前空間（前月コピーの対象月検証 Issue #140 にちなむ固定値。
-- migration 34 の確定と書き込みの月ロック（148）とは別の値にし、互いに干渉させない）、
-- 第 2 キーは月（YYYYMM）。排他ロックのみで、トランザクションの終了まで保持される。
-- pg_advisory_* の EXECUTE 権限の有無に左右されないよう SECURITY DEFINER にする
-- （private.lock_pl_month と同じ）。
CREATE OR REPLACE FUNCTION private.lock_extra_entries_copy(p_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    140,
    extract(year FROM p_month)::integer * 100 + extract(month FROM p_month)::integer
  );
END;
$$;

COMMENT ON FUNCTION private.lock_extra_entries_copy(date) IS
  '経理追加収支の前月コピーを対象月ごとに直列化する排他 advisory lock（第 1 キー 140、第 2 キー YYYYMM）。トランザクション終了まで保持。copy_extra_entries から呼ぶ。詳細: docs/database.md 5.7';

REVOKE EXECUTE ON FUNCTION private.lock_extra_entries_copy(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.lock_extra_entries_copy(date) TO authenticated;

-- ===== 前月コピーの書き込み =====
-- p_target_month: コピー先の月（月内の任意の日付でよい。月初日に丸める）
-- p_rows: 追加する行の配列（キーは extra_entries の列名。id は含めない）。複製元の取得と
--   行の組み立て（日付の月の置き換え・請求書番号を空にする等）はアプリ側
--   （app/utils/extraEntry.ts の buildCopiedExtraEntries）で行う。entry_date はすべて
--   p_target_month の月内であること（それ以外の月の行が混ざると、その月はロックで守られないため
--   INVALID_INPUT で全体を拒否する）
-- 戻り値: 登録した件数（inserted_count）と、当月に同一内容の行が既にあるため除いた件数
--   （skipped_count）
--
-- 同一内容の判定: entry_type・分類・内容・責任者・チーム・請求額・経費がすべて一致する行
-- （NULL 同士も一致とみなす）。entry_date は対象月内で共通のため比較せず、請求書番号
-- （コピーでは常に空）・請求先（自由入力の補足情報）・決済方法は比較しない（従来のアプリ側の
-- 判定と同じ）。p_rows の中の同一内容の行どうしは除かない
-- （前月に同一内容の行が複数あればすべてコピーする）。
--
-- SECURITY INVOKER（既定）にし、extra_entries の RLS（書き込みは accounting / admin のみ・
-- 確定済みの月の編集ロック）と、確定との直列化トリガー（migration 34）をそのまま適用する。
-- 既存行の確認も RLS 越しに行う（コピーできる accounting / admin は全行を参照できる）。
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
      AND e.entry_type = r.entry_type
      AND e.category = r.category
      AND e.description = r.description
      AND e.manager_id = r.manager_id
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
