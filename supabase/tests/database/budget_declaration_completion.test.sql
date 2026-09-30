-- pgTAP tests for budget declaration completion (completed_at / completed_by, save_budget_declaration p_completed)
-- Run: supabase test db (local Supabase running; docs/testing.md 3.8)
BEGIN;
SELECT plan(22);

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'acc@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'tla@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'tlb@example.com');
INSERT INTO public.profiles (user_id, email, name, class, team) VALUES
  ('11111111-1111-1111-1111-111111111111', 'acc@example.com', '経理', 'accounting', NULL),
  ('22222222-2222-2222-2222-222222222222', 'tla@example.com', 'リーダーA', 'teamleader', 'Aチーム'),
  ('33333333-3333-3333-3333-333333333333', 'tlb@example.com', 'リーダーB', 'teamleader', 'Bチーム');

-- ===== new declaration: p_completed on INSERT =====
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT public.save_budget_declaration(DATE '2026-09-01', 'Bチーム', '[]'::jsonb, NULL, NULL, true)$$,
  '新規作成と同時に完了にできる（明細 0 件）');
SELECT is(
  (SELECT completed_at IS NOT NULL AND completed_by = (SELECT id FROM public.profiles WHERE email = 'tlb@example.com')
   FROM public.budget_declarations WHERE team = 'Bチーム' AND target_month = DATE '2026-09-01'),
  true, '新規作成で完了にすると completed_at が設定され completed_by は保存者になる');
SELECT lives_ok(
  $$SELECT public.save_budget_declaration(DATE '2026-08-01', 'Bチーム', '[]'::jsonb)$$,
  'p_completed を省略して新規作成できる');
SELECT is(
  (SELECT completed_at IS NULL AND completed_by IS NULL
   FROM public.budget_declarations WHERE team = 'Bチーム' AND target_month = DATE '2026-08-01'),
  true, 'p_completed を省略した新規作成は入力中になる');
RESET ROLE;

-- ===== teamleader A: create in progress, complete, re-save, revert =====
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT public.save_budget_declaration(DATE '2026-10-01', 'Aチーム',
      '[{"entry_type":"income","category":"協賛金","description":"x","amount":100}]'::jsonb,
      NULL, NULL, false)$$,
  '完了なし（false）で保存すると入力中の申告が作成される');
SELECT is(
  (SELECT completed_at IS NULL AND completed_by IS NULL FROM public.budget_declarations WHERE team = 'Aチーム'),
  true, '完了なしの申告は completed_at / completed_by が NULL（入力中）');

SELECT lives_ok(
  $$SELECT public.save_budget_declaration(DATE '2026-10-01', 'Aチーム', '[]'::jsonb,
      (SELECT id FROM public.budget_declarations WHERE team = 'Aチーム'), NULL, true)$$,
  '明細 0 件でも完了にして保存できる');
SELECT is(
  (SELECT completed_by FROM public.budget_declarations WHERE team = 'Aチーム'),
  (SELECT id FROM public.profiles WHERE email = 'tla@example.com'),
  'completed_by は auth.uid() から解決した保存者になる');
SELECT is(
  (SELECT count(*) FROM public.budget_declaration_items)::int,
  0, '完了にした保存でも明細は差し替えられる（0 件）');

-- Pin completed_at to a known past value to observe whether re-saving moves it.
RESET ROLE;
UPDATE public.budget_declarations SET completed_at = TIMESTAMPTZ '2026-09-01 00:00:00+09' WHERE team = 'Aチーム';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

SELECT lives_ok(
  $$SELECT public.save_budget_declaration(DATE '2026-10-01', 'Aチーム', '[]'::jsonb,
      (SELECT id FROM public.budget_declarations WHERE team = 'Aチーム'), 'コメント', true)$$,
  '完了済みの申告をチェックを外さずに再保存できる');
SELECT is(
  (SELECT completed_at FROM public.budget_declarations WHERE team = 'Aチーム'),
  TIMESTAMPTZ '2026-09-01 00:00:00+09', '完了済みのまま再保存しても completed_at は更新されない');

SELECT lives_ok(
  $$SELECT public.save_budget_declaration(DATE '2026-10-01', 'Aチーム', '[]'::jsonb,
      (SELECT id FROM public.budget_declarations WHERE team = 'Aチーム'), NULL, NULL)$$,
  'p_completed を省略（NULL）しても保存できる');
SELECT isnt(
  (SELECT completed_at FROM public.budget_declarations WHERE team = 'Aチーム'),
  NULL, 'p_completed が NULL のときは完了状態を変更しない');

SELECT lives_ok(
  $$SELECT public.save_budget_declaration(DATE '2026-10-01', 'Aチーム', '[]'::jsonb,
      (SELECT id FROM public.budget_declarations WHERE team = 'Aチーム'), NULL, false)$$,
  'チェックを外して保存できる');
SELECT is(
  (SELECT completed_at IS NULL AND completed_by IS NULL FROM public.budget_declarations WHERE team = 'Aチーム'),
  true, 'チェックを外すと completed_at / completed_by が NULL に戻る（入力中）');

-- ===== impersonation: completed_by follows the caller, never the client =====
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT public.save_budget_declaration(DATE '2026-10-01', 'Aチーム', '[]'::jsonb,
      (SELECT id FROM public.budget_declarations WHERE team = 'Aチーム'), NULL, true)$$,
  'accounting は他チームの申告を完了にできる');
SELECT is(
  (SELECT completed_by FROM public.budget_declarations WHERE team = 'Aチーム'),
  (SELECT id FROM public.profiles WHERE email = 'acc@example.com'),
  'completed_by は実際の保存者（経理）になり、クライアントから指定できない');

-- ===== permissions: other team's leader cannot change completion =====
SELECT set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT public.save_budget_declaration(DATE '2026-10-01', 'Aチーム', '[]'::jsonb,
      (SELECT id FROM public.budget_declarations WHERE team = 'Aチーム'), NULL, false)$$,
  'P0002', 'DECLARATION_NOT_FOUND', '他チームのリーダーは完了状態を変更できない');
SELECT is(
  (SELECT completed_at IS NOT NULL FROM public.budget_declarations WHERE team = 'Aチーム'),
  true, '他チームのリーダーの操作で完了状態は変わらない');

-- ===== constraint: completed_at and completed_by are set together =====
RESET ROLE;
SELECT throws_ok(
  $$UPDATE public.budget_declarations SET completed_by = NULL WHERE team = 'Aチーム'$$,
  '23514', NULL, 'completed_at だけ設定された状態は CHECK 制約で拒否される');

-- ===== closed month: completion cannot change =====
INSERT INTO public.budget_declaration_closings (target_month, closed_by, closed_by_name)
SELECT DATE '2026-10-01', id, name FROM public.profiles WHERE email = 'acc@example.com';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT public.save_budget_declaration(DATE '2026-10-01', 'Aチーム', '[]'::jsonb,
      (SELECT id FROM public.budget_declarations WHERE team = 'Aチーム'), NULL, false)$$,
  '42501', 'MONTH_CLOSED', '確定月は完了状態の変更も MONTH_CLOSED で拒否される');
WITH u AS (UPDATE public.budget_declarations SET completed_at = NULL, completed_by = NULL WHERE team = 'Aチーム' RETURNING 1)
SELECT is((SELECT count(*) FROM u)::int, 0, '確定月は直接 UPDATE でも完了状態を変更できない（RLS で 0 行）');

SELECT * FROM finish();
ROLLBACK;
