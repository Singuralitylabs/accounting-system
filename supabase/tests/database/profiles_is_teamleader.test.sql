-- pgTAP tests for the profiles.is_teamleader flag (migration 41)
-- Run: supabase test db (local Supabase running; docs/testing.md 3.8)
BEGIN;
SELECT plan(22);

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'accleader@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'publeader@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'other@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'admin@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'pub@example.com');
INSERT INTO public.profiles (user_id, email, name, class, team, is_teamleader) VALUES
  ('11111111-1111-1111-1111-111111111111', 'accleader@example.com', '経理リーダー', 'accounting', 'Aチーム', true),
  ('22222222-2222-2222-2222-222222222222', 'publeader@example.com', 'リーダー', 'public', 'Aチーム', true),
  ('33333333-3333-3333-3333-333333333333', 'other@example.com', 'Bメンバー', 'public', 'Bチーム', false),
  ('44444444-4444-4444-4444-444444444444', 'admin@example.com', '管理者', 'admin', NULL, false),
  ('55555555-5555-5555-5555-555555555555', 'pub@example.com', 'Aメンバー', 'public', 'Aチーム', false);

INSERT INTO public.matters (title, category, team, user_id, start_date)
SELECT v.title, 'テスト', v.team, (SELECT id FROM public.profiles WHERE email = v.email), DATE '2026-10-01'
FROM (VALUES ('A案件', 'Aチーム', 'pub@example.com'), ('B案件', 'Bチーム', 'other@example.com')) AS v(title, team, email);

-- ===== helper: flag defaults to false =====
SELECT is(
  (SELECT is_teamleader FROM public.profiles WHERE email = 'other@example.com'), false,
  'is_teamleader の既定値は false');

-- ===== accounting + is_teamleader: accounting operations and own-team leader operations =====
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

SELECT is((SELECT public.auth_user_is_teamleader()), true, '兼任ユーザーは auth_user_is_teamleader() が true');
SELECT is((SELECT public.auth_user_class()), 'accounting', '兼任ユーザーの class は accounting のまま');
SELECT is((SELECT count(*) FROM public.matters)::int, 2, '兼任ユーザーは全案件を閲覧できる');
SELECT is((SELECT count(*) FROM public.profiles)::int, 5, '兼任ユーザー（経理）は全プロフィールを閲覧できる');
SELECT lives_ok(
  $$INSERT INTO public.recurring_costs (name, item, price, start_month, team)
    VALUES ('定期', '家賃', 100, DATE '2026-10-01', 'Bチーム')$$,
  '兼任ユーザーは経理として定期費用を追加できる');
SELECT is((SELECT public.can_access_team_budget('Bチーム')), true, '兼任ユーザーは経理として他チームの事前収支申告にアクセスできる');

-- ===== public + is_teamleader: same as the former teamleader class =====
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

SELECT is((SELECT count(*) FROM public.matters)::int, 2, 'public + is_teamleader は全チームの案件を閲覧できる');
SELECT is((SELECT count(*) FROM public.profiles)::int, 3, 'public + is_teamleader は自分と自チームのプロフィールのみ閲覧できる');
SELECT is((SELECT public.can_access_team_budget('Aチーム')), true, 'public + is_teamleader は自チームの事前収支申告を書き込める');
SELECT is((SELECT public.can_access_team_budget('Bチーム')), false, 'public + is_teamleader は他チームの事前収支申告を書き込めない');
SELECT throws_ok(
  $$INSERT INTO public.recurring_costs (name, item, price, start_month, team)
    VALUES ('不正', '家賃', 1, DATE '2026-11-01', 'Aチーム')$$,
  '42501', NULL, 'public + is_teamleader は定期費用を追加できない');

-- ===== self-update cannot change is_teamleader =====
WITH u AS (UPDATE public.profiles SET slack_id = 'U123' WHERE user_id = '22222222-2222-2222-2222-222222222222' RETURNING 1)
SELECT is((SELECT count(*) FROM u)::int, 1, '自分の slack_id は更新できる');
SELECT throws_ok(
  $$UPDATE public.profiles SET is_teamleader = false WHERE user_id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', NULL, '自分の is_teamleader を外せない');

SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
SELECT throws_ok(
  $$UPDATE public.profiles SET is_teamleader = true WHERE user_id = '55555555-5555-5555-5555-555555555555'$$,
  '42501', NULL, 'public ユーザーは自分に is_teamleader を付与できない');
SELECT is((SELECT count(*) FROM public.matters)::int, 1, 'フラグの無い public は自分の案件のみ閲覧できる');

-- ===== admin: can set the flag through update_profiles =====
SELECT set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
SELECT lives_ok(
  $$SELECT public.update_profiles(jsonb_build_array(jsonb_build_object(
      'id', (SELECT id FROM public.profiles WHERE email = 'other@example.com'),
      'class', 'accounting', 'is_teamleader', true, 'team', 'Bチーム', 'slack_id', NULL)))$$,
  '管理者は class と is_teamleader を同時に更新できる');
SELECT throws_ok(
  $$SELECT public.update_profiles(jsonb_build_array(jsonb_build_object(
      'id', (SELECT id FROM public.profiles WHERE email = 'other@example.com'),
      'class', 'teamleader', 'is_teamleader', false, 'team', 'Bチーム', 'slack_id', NULL)))$$,
  '22023', 'INVALID_INPUT', 'class に teamleader は指定できない');

-- ===== Custom Access Token Hook claims (run as supabase_auth_admin, as Supabase Auth does) =====
RESET ROLE;
SET LOCAL ROLE supabase_auth_admin;
SELECT is(
  (public.custom_access_token_hook(jsonb_build_object('user_id', '11111111-1111-1111-1111-111111111111', 'claims', '{"sub":"s"}'::jsonb))
    -> 'claims' ->> 'user_class'),
  'accounting', 'Hook は user_class を付与する');
SELECT is(
  (public.custom_access_token_hook(jsonb_build_object('user_id', '11111111-1111-1111-1111-111111111111', 'claims', '{"sub":"s"}'::jsonb))
    -> 'claims' -> 'user_is_teamleader'),
  'true'::jsonb, 'Hook は兼任ユーザーに user_is_teamleader = true（boolean）を付与する');
SELECT is(
  (public.custom_access_token_hook(jsonb_build_object('user_id', '55555555-5555-5555-5555-555555555555', 'claims', '{"sub":"s"}'::jsonb))
    -> 'claims' -> 'user_is_teamleader'),
  'false'::jsonb, 'Hook はフラグ無しのユーザーに user_is_teamleader = false を付与する');
SELECT is(
  (public.custom_access_token_hook(jsonb_build_object('user_id', '99999999-9999-9999-9999-999999999999', 'claims', '{"sub":"s"}'::jsonb))
    -> 'claims' -> 'user_is_teamleader'),
  'null'::jsonb, 'Hook はプロフィールが無いユーザーには user_is_teamleader = null を付与する（middleware が DB にフォールバック）');

SELECT * FROM finish();
ROLLBACK;
