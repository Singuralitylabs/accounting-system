-- pgTAP tests for budget_declaration_reminder_days RLS and replace_budget_declaration_reminder_days
-- Run: supabase test db (local Supabase running; docs/testing.md 3.8)
BEGIN;
SELECT plan(19);

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'acc@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'tl@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'pub@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'adm@example.com');
INSERT INTO public.profiles (user_id, email, name, class, team) VALUES
  ('11111111-1111-1111-1111-111111111111', 'acc@example.com', '経理', 'accounting', NULL),
  ('22222222-2222-2222-2222-222222222222', 'tl@example.com', 'リーダー', 'public', 'Aチーム'),
  ('44444444-4444-4444-4444-444444444444', 'pub@example.com', '一般', 'public', NULL),
  ('55555555-5555-5555-5555-555555555555', 'adm@example.com', '管理者', 'admin', NULL);
UPDATE public.profiles SET is_teamleader = true WHERE email = 'tl@example.com';

-- Rows carried over from the old target_days ({15,18,20}) by the migration
SELECT is((SELECT count(*) FROM public.budget_declaration_reminder_days)::int, 3, '既存の対象日 3 件が既定文面で引き継がれている');
SELECT is(
  (SELECT count(*) FROM public.budget_declaration_reminder_days WHERE message LIKE '%{month}%')::int,
  3, '既定文面に {month} プレースホルダがある');

-- ===== accounting =====
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

SELECT is((SELECT count(*) FROM public.budget_declaration_reminder_days)::int, 3, 'accounting は閲覧できる');
SELECT lives_ok(
  $$SELECT public.replace_budget_declaration_reminder_days('[{"day":10,"message":"予告"},{"day":20,"message":"本日期限"}]'::jsonb)$$,
  'accounting は全置換できる');
SELECT is(
  (SELECT array_agg(day ORDER BY day) FROM public.budget_declaration_reminder_days),
  ARRAY[10, 20]::smallint[], '全置換で古い行が消え新しい行だけになる');
SELECT is(
  (SELECT message FROM public.budget_declaration_reminder_days WHERE day = 20),
  '本日期限', '日ごとの文面が保存される');
SELECT throws_ok(
  $$SELECT public.replace_budget_declaration_reminder_days('[{"day":20,"message":"a"},{"day":20,"message":"b"}]'::jsonb)$$,
  '23505', NULL, '同じ日の重複は拒否される');
SELECT throws_ok(
  $$SELECT public.replace_budget_declaration_reminder_days('[{"day":32,"message":"a"}]'::jsonb)$$,
  '23514', NULL, '範囲外の日（32）は CHECK で拒否される');
SELECT throws_ok(
  $$SELECT public.replace_budget_declaration_reminder_days('[{"day":5,"message":""}]'::jsonb)$$,
  '23514', NULL, '空の文面は CHECK で拒否される');
SELECT throws_ok(
  $$SELECT public.replace_budget_declaration_reminder_days('[{"day":5,"message":"  "}]'::jsonb)$$,
  '23514', NULL, '空白だけの文面は CHECK で拒否される');
SELECT is(
  (SELECT array_agg(day ORDER BY day) FROM public.budget_declaration_reminder_days),
  ARRAY[10, 20]::smallint[], '失敗した全置換は 1 トランザクションでロールバックされ元の行が残る');
SELECT lives_ok(
  $$SELECT public.replace_budget_declaration_reminder_days('[]'::jsonb)$$,
  '空配列で全置換できる（リマインド停止）');
SELECT is((SELECT count(*) FROM public.budget_declaration_reminder_days)::int, 0, '空配列で 0 件になる');

-- ===== admin =====
SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT public.replace_budget_declaration_reminder_days('[{"day":15,"message":"管理者"}]'::jsonb)$$,
  'admin は全置換できる');

-- ===== teamleader (public + flag) =====
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM public.budget_declaration_reminder_days)::int, 0, 'teamleader は閲覧できない');
SELECT throws_ok(
  $$SELECT public.replace_budget_declaration_reminder_days('[]'::jsonb)$$,
  '42501', NULL, 'teamleader は空配列でも全置換できない（黙って成功しない）');
SELECT throws_ok(
  $$INSERT INTO public.budget_declaration_reminder_days (day, message) VALUES (1, 'x')$$,
  '42501', NULL, 'teamleader は直接 INSERT できない');

-- ===== public =====
SELECT set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT public.replace_budget_declaration_reminder_days('[{"day":1,"message":"x"}]'::jsonb)$$,
  '42501', NULL, 'public は全置換できない');
WITH d AS (DELETE FROM public.budget_declaration_reminder_days RETURNING 1)
SELECT is((SELECT count(*) FROM d)::int, 0, 'public は直接 DELETE しても 0 行');

SELECT * FROM finish();
ROLLBACK;
