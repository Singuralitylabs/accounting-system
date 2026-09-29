-- copy_extra_entries（経理追加収支の前月コピー）の重複判定の pgTAP テスト（Issue #187）
-- 実行: supabase test db（ローカル Supabase 起動中。docs/testing.md 3.8）
BEGIN;
SELECT plan(11);

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'acc1@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'acc2@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'pub@example.com');
INSERT INTO public.profiles (user_id, email, name, class) VALUES
  ('11111111-1111-1111-1111-111111111111', 'acc1@example.com', '経理1', 'accounting'),
  ('22222222-2222-2222-2222-222222222222', 'acc2@example.com', '経理2', 'accounting'),
  ('33333333-3333-3333-3333-333333333333', 'pub@example.com', '一般', 'public');

-- 経理 1 / 経理 2 の profiles.id（責任者）
CREATE TEMP TABLE mgr AS
  SELECT (SELECT id FROM public.profiles WHERE email = 'acc1@example.com') AS m1,
         (SELECT id FROM public.profiles WHERE email = 'acc2@example.com') AS m2;
GRANT SELECT ON mgr TO authenticated;

-- 当月（2026-10）の既存行 3 件（team・金額の NULL パターンを含む）と、対象月の範囲外の行 2 件
INSERT INTO public.extra_entries
  (entry_type, category, entry_date, description, manager_id, team, billing_amount, expense_amount, payment_method)
SELECT v.entry_type, v.category, v.entry_date, v.description, (SELECT m1 FROM mgr),
       v.team, v.billing_amount, v.expense_amount, v.payment_method
FROM (VALUES
  ('income',  '協賛金', DATE '2026-10-01', '収入A', NULL::text,  1000::numeric, NULL::numeric, NULL::text),
  ('expense', '交通費', DATE '2026-10-02', '支出B', NULL,        NULL,           500,           '現金'),
  ('expense', '交通費', DATE '2026-10-03', '支出C', 'Aチーム',   NULL,           300,           '現金'),
  ('income',  '協賛金', DATE '2026-09-30', '範囲外前月', NULL,   777,            NULL,          NULL),
  ('income',  '協賛金', DATE '2026-11-01', '範囲外翌月', NULL,   888,            NULL,          NULL)
) AS v(entry_type, category, entry_date, description, team, billing_amount, expense_amount, payment_method);

-- NULL 同士の一致（migration 37。Issue #188）の回帰ガード。description・category は現状 NOT NULL の
-- ため、テストのトランザクション内（ROLLBACK で戻る）だけ NULL 許容にして、NULL の既存行を置く。
-- 比較が = に戻ると（NULL = NULL は真にならず）重複と判定されなくなり、下のテストが落ちる
ALTER TABLE public.extra_entries ALTER COLUMN description DROP NOT NULL;
ALTER TABLE public.extra_entries ALTER COLUMN category DROP NOT NULL;
INSERT INTO public.extra_entries
  (entry_type, category, entry_date, description, manager_id, team, billing_amount, expense_amount, payment_method)
SELECT 'income', NULL, DATE '2026-10-04', NULL, (SELECT m1 FROM mgr), NULL, 4242, NULL, NULL;

-- コピー行の組み立て（テストのトランザクションごと ROLLBACK される）。entry_date は対象月内の日付を渡す（判定では比較されない）
CREATE FUNCTION public.tap_mk(
  p_type text, p_cat text, p_desc text, p_team text,
  p_billing numeric, p_expense numeric, p_manager bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'entry_type', p_type, 'category', p_cat, 'entry_date', '2026-10-20',
    'description', p_desc, 'manager_id', COALESCE(p_manager, (SELECT m1 FROM mgr)),
    'team', p_team, 'billing_amount', p_billing, 'expense_amount', p_expense,
    'payment_method', CASE WHEN p_type = 'expense' THEN '現金' END)
$$;
GRANT EXECUTE ON FUNCTION public.tap_mk(text, text, text, text, numeric, numeric, bigint) TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 全列一致はスキップ（金額は 1000 と 1000.00 が数値として一致）。team / 金額が NULL 同士の行も一致扱い
SELECT results_eq(
  $$SELECT inserted_count, skipped_count FROM public.copy_extra_entries('2026-10-01', jsonb_build_array(
      public.tap_mk('income',  '協賛金', '収入A', NULL, 1000.00, NULL),
      public.tap_mk('expense', '交通費', '支出B', NULL, NULL, 500),
      public.tap_mk('expense', '交通費', '支出C', 'Aチーム', NULL, 300)))$$,
  $$VALUES (0, 3)$$,
  '全列（NULL 同士を含む）が一致する行はすべてスキップされ、件数が戻り値に出る'
);
SELECT is(
  (SELECT count(*)::int FROM public.extra_entries WHERE entry_date >= '2026-10-01' AND entry_date < '2026-11-01'),
  4, 'スキップだけなら当月の行数は増えない（既存 3 行 + NULL 同士の確認用の 1 行）');

-- どれか 1 列でも異なれば登録される（1 列ずつ変える）
SELECT results_eq(
  $$SELECT inserted_count, skipped_count FROM public.copy_extra_entries('2026-10-01', jsonb_build_array(
      public.tap_mk('expense', '協賛金', '収入A', NULL, NULL, 1000)))$$,
  $$VALUES (1, 0)$$, '種別が異なれば（種別ごとの CHECK 制約により金額の列も変わる）登録される');
SELECT results_eq(
  $$SELECT inserted_count, skipped_count FROM public.copy_extra_entries('2026-10-01', jsonb_build_array(
      public.tap_mk('income', '雑収入', '収入A', NULL, 1000, NULL)))$$,
  $$VALUES (1, 0)$$, '分類が異なれば登録される');
SELECT results_eq(
  $$SELECT inserted_count, skipped_count FROM public.copy_extra_entries('2026-10-01', jsonb_build_array(
      public.tap_mk('income', '協賛金', '別内容', NULL, 1000, NULL)))$$,
  $$VALUES (1, 0)$$, '内容が異なれば登録される');
SELECT results_eq(
  $$SELECT inserted_count, skipped_count FROM public.copy_extra_entries('2026-10-01', jsonb_build_array(
      public.tap_mk('income', '協賛金', '収入A', NULL, 1000, NULL, (SELECT m2 FROM mgr))))$$,
  $$VALUES (1, 0)$$, '責任者が異なれば登録される');
SELECT results_eq(
  $$SELECT inserted_count, skipped_count FROM public.copy_extra_entries('2026-10-01', jsonb_build_array(
      public.tap_mk('income',  '協賛金', '収入A', 'Bチーム', 1000, NULL),
      public.tap_mk('expense', '交通費', '支出C', NULL, NULL, 300)))$$,
  $$VALUES (2, 0)$$, 'チームが異なれば（NULL と値の違いも含めて）登録される');
SELECT results_eq(
  $$SELECT inserted_count, skipped_count FROM public.copy_extra_entries('2026-10-01', jsonb_build_array(
      public.tap_mk('income',  '協賛金', '収入A', NULL, 1001, NULL),
      public.tap_mk('expense', '交通費', '支出B', NULL, NULL, 501),
      public.tap_mk('income',  '協賛金', '支出B', NULL, 500, NULL)))$$,
  $$VALUES (3, 0)$$, '請求額・経費が異なれば（NULL と値の違いも含めて）登録される');

-- 対象月の範囲外（前月末・翌月初）の行と同一内容でも、当月に無ければ重複とみなさない。
-- p_rows 内の同一内容の行どうしは除かない（両方登録される）
SELECT results_eq(
  $$SELECT inserted_count, skipped_count FROM public.copy_extra_entries('2026-10-01', jsonb_build_array(
      public.tap_mk('income', '協賛金', '範囲外前月', NULL, 777, NULL),
      public.tap_mk('income', '協賛金', '範囲外翌月', NULL, 888, NULL),
      public.tap_mk('income', '協賛金', '同一2件', NULL, 5, NULL),
      public.tap_mk('income', '協賛金', '同一2件', NULL, 5, NULL)))$$,
  $$VALUES (4, 0)$$, '範囲外の月の行は重複とみなさず、p_rows 内の同一内容の行はどちらも登録される');

-- description・category が NULL 同士の行も一致とみなしてスキップされる（= だと登録されてしまう）
SELECT results_eq(
  $$SELECT inserted_count, skipped_count FROM public.copy_extra_entries('2026-10-01', jsonb_build_array(
      public.tap_mk('income', NULL, NULL, NULL, 4242, NULL)))$$,
  $$VALUES (0, 1)$$, 'description・category が NULL 同士の行は一致とみなしてスキップされる');

-- 一般ユーザーは FORBIDDEN
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT * FROM public.copy_extra_entries('2026-10-01', '[]'::jsonb)$$,
  '42501', 'FORBIDDEN', '経理・管理者以外は FORBIDDEN');

SELECT * FROM finish();
ROLLBACK;
