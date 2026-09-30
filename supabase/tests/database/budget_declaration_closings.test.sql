-- pgTAP tests for all-team read access and monthly closing of budget declarations
-- Run: supabase test db (local Supabase running; docs/testing.md 3.8)
BEGIN;
SELECT plan(31);

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'acc@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'tla@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'tlb@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'pub@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'adm@example.com');
INSERT INTO public.profiles (user_id, email, name, class, team) VALUES
  ('11111111-1111-1111-1111-111111111111', 'acc@example.com', '経理', 'accounting', NULL),
  ('22222222-2222-2222-2222-222222222222', 'tla@example.com', 'リーダーA', 'teamleader', 'Aチーム'),
  ('33333333-3333-3333-3333-333333333333', 'tlb@example.com', 'リーダーB', 'teamleader', 'Bチーム'),
  ('44444444-4444-4444-4444-444444444444', 'pub@example.com', '一般', 'public', NULL),
  ('55555555-5555-5555-5555-555555555555', 'adm@example.com', '管理者', 'admin', NULL);

-- October: teams A and B have both declared (one line each)
INSERT INTO public.budget_declarations (target_month, team, declared_by)
SELECT DATE '2026-10-01', t.team, (SELECT id FROM public.profiles WHERE email = 'acc@example.com')
FROM (VALUES ('Aチーム'), ('Bチーム')) AS t(team);
INSERT INTO public.budget_declaration_items (declaration_id, entry_type, category, description, amount)
SELECT d.id, 'income', '協賛金', 'テスト', 1000 FROM public.budget_declarations d;

-- ===== teamleader: read all teams, write own team only =====
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

SELECT is((SELECT count(*) FROM public.budget_declarations)::int, 2, 'teamleader は他チームの申告ヘッダも閲覧できる');
SELECT is((SELECT count(*) FROM public.budget_declaration_items)::int, 2, 'teamleader は他チームの申告明細も閲覧できる');

WITH u AS (UPDATE public.budget_declarations SET comment = 'x' WHERE team = 'Bチーム' RETURNING 1)
SELECT is((SELECT count(*) FROM u)::int, 0, 'teamleader は他チームの申告ヘッダを更新できない');
WITH u AS (UPDATE public.budget_declaration_items SET amount = 1 WHERE declaration_id IN
  (SELECT id FROM public.budget_declarations WHERE team = 'Bチーム') RETURNING 1)
SELECT is((SELECT count(*) FROM u)::int, 0, 'teamleader は他チームの申告明細を更新できない');
WITH d AS (DELETE FROM public.budget_declarations WHERE team = 'Bチーム' RETURNING 1)
SELECT is((SELECT count(*) FROM d)::int, 0, 'teamleader は他チームの申告を削除できない');
SELECT throws_ok(
  $$INSERT INTO public.budget_declarations (target_month, team, declared_by)
    SELECT DATE '2026-11-01', 'Bチーム', id FROM public.profiles WHERE email = 'tla@example.com'$$,
  '42501', NULL, 'teamleader は他チームの申告を作成できない');
SELECT lives_ok(
  $$SELECT public.save_budget_declaration(DATE '2026-11-01', 'Aチーム', '[]'::jsonb)$$,
  'teamleader は自チームの申告を作成できる');

SELECT throws_ok(
  $$INSERT INTO public.budget_declaration_closings (target_month, closed_by, closed_by_name)
    SELECT DATE '2026-10-01', id, name FROM public.profiles WHERE email = 'tla@example.com'$$,
  '42501', NULL, 'teamleader は確定できない');

-- ===== public: no access =====
SELECT set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM public.budget_declarations)::int, 0, 'public は申告を閲覧できない');
SELECT is((SELECT count(*) FROM public.budget_declaration_closings)::int, 0, 'public は確定状態を閲覧できない');
SELECT throws_ok(
  $$INSERT INTO public.budget_declaration_closings (target_month, closed_by, closed_by_name)
    SELECT DATE '2026-10-01', id, name FROM public.profiles WHERE email = 'pub@example.com'$$,
  '42501', NULL, 'public は確定できない');

-- ===== accounting: closing =====
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SELECT throws_ok(
  $$INSERT INTO public.budget_declaration_closings (target_month, closed_by, closed_by_name)
    SELECT DATE '2026-10-15', id, name FROM public.profiles WHERE email = 'acc@example.com'$$,
  '23514', NULL, '確定の対象月は月初日でなければならない');
SELECT throws_ok(
  $$INSERT INTO public.budget_declaration_closings (target_month, closed_by, closed_by_name)
    SELECT DATE '2026-10-01', id, name FROM public.profiles WHERE email = 'adm@example.com'$$,
  '42501', NULL, '他人名義では確定できない');
SELECT lives_ok(
  $$INSERT INTO public.budget_declaration_closings (target_month, closed_by, closed_by_name)
    SELECT DATE '2026-10-01', id, 'ニセ' FROM public.profiles WHERE email = 'acc@example.com'$$,
  'accounting は確定できる');
SELECT is((SELECT closed_by_name FROM public.budget_declaration_closings), '経理', '確定者名は profiles から採用され、直接 INSERT で偽装できない');

-- ===== closed month: no writes for any role =====
SELECT throws_ok(
  $$INSERT INTO public.budget_declarations (target_month, team, declared_by)
    SELECT DATE '2026-10-01', 'Cチーム', id FROM public.profiles WHERE email = 'acc@example.com'$$,
  '42501', NULL, '確定月は accounting でも申告を作成できない');
SELECT throws_ok(
  $$SELECT public.save_budget_declaration(DATE '2026-10-01', 'Cチーム', '[]'::jsonb)$$,
  '42501', 'MONTH_CLOSED', '確定月の save_budget_declaration は MONTH_CLOSED で拒否される');
WITH u AS (UPDATE public.budget_declaration_items SET amount = 5 RETURNING 1)
SELECT is((SELECT count(*) FROM u)::int, 0, '確定月は明細を更新できない（RLS で 0 行）');

WITH u AS (UPDATE public.budget_declarations SET comment = 'x' WHERE target_month = DATE '2026-10-01' RETURNING 1)
SELECT is((SELECT count(*) FROM u)::int, 0, '確定月はヘッダを更新できない（RLS で 0 行）');
WITH d AS (DELETE FROM public.budget_declarations WHERE target_month = DATE '2026-10-01' RETURNING 1)
SELECT is((SELECT count(*) FROM d)::int, 0, '確定月は申告を削除できない（RLS で 0 行）');

SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT public.save_budget_declaration(DATE '2026-10-01', 'Aチーム', '[]'::jsonb,
      (SELECT id FROM public.budget_declarations WHERE team = 'Aチーム' AND target_month = DATE '2026-10-01'))$$,
  '42501', 'MONTH_CLOSED', '確定月は teamleader も自チームの申告を保存できない');
SELECT is((SELECT count(*) FROM public.budget_declaration_closings)::int, 1, 'teamleader は確定状態を閲覧できる');
WITH d AS (DELETE FROM public.budget_declaration_closings RETURNING 1)
SELECT is((SELECT count(*) FROM d)::int, 0, 'teamleader は確定を解除できない');

-- ===== delete_budget_declaration =====
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

SELECT throws_ok(
  $$SELECT * FROM public.delete_budget_declaration(
      (SELECT id FROM public.budget_declarations WHERE team = 'Aチーム' AND target_month = DATE '2026-10-01'), 'Aチーム')$$,
  '42501', 'MONTH_CLOSED', '削除 RPC: 確定月は MONTH_CLOSED で拒否される');
SELECT throws_ok(
  $$SELECT * FROM public.delete_budget_declaration(
      (SELECT id FROM public.budget_declarations WHERE team = 'Bチーム' AND target_month = DATE '2026-10-01'), 'Bチーム')$$,
  '42501', 'MONTH_CLOSED', '削除 RPC: 確定月は他チームの申告でも MONTH_CLOSED で拒否される');

SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
WITH d AS (DELETE FROM public.budget_declaration_closings RETURNING 1)
SELECT is((SELECT count(*) FROM d)::int, 1, 'admin は確定を解除できる');

SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SELECT is(
  (SELECT count(*) FROM public.delete_budget_declaration(
      (SELECT id FROM public.budget_declarations WHERE team = 'Bチーム' AND target_month = DATE '2026-10-01'), 'Bチーム'))::int,
  0, '削除 RPC: teamleader は未確定月でも他チームの申告を削除できない（0 行）');
SELECT is(
  (SELECT count(*) FROM public.delete_budget_declaration(
      (SELECT id FROM public.budget_declarations WHERE team = 'Aチーム' AND target_month = DATE '2026-10-01'), 'Bチーム'))::int,
  0, '削除 RPC: id と team が食い違うと何も削除しない');
SELECT is(
  (SELECT count(*) FROM public.delete_budget_declaration(
      (SELECT id FROM public.budget_declarations WHERE team = 'Aチーム' AND target_month = DATE '2026-10-01'), 'Aチーム'))::int,
  1, '削除 RPC: teamleader は未確定月の自チームの申告を削除できる');
SELECT is(
  (SELECT count(*) FROM public.budget_declaration_items WHERE declaration_id NOT IN (SELECT id FROM public.budget_declarations))::int,
  0, '削除 RPC: 明細もヘッダと一緒に削除される（CASCADE）');

-- ===== after reopening (by admin) writes work again =====
SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT public.save_budget_declaration(DATE '2026-10-01', 'Cチーム',
      '[{"entry_type":"income","category":"協賛金","description":"x","amount":100}]'::jsonb)$$,
  '確定解除後は明細付きの申告を保存できる');

SELECT * FROM finish();
ROLLBACK;
