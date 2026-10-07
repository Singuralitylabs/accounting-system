-- pgTAP tests for slack_notification_settings RLS (admin / accounting only; no INSERT / DELETE)
-- Run: supabase test db (local Supabase running; docs/testing.md 3.8)
BEGIN;
SELECT plan(11);

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

SELECT is((SELECT count(*) FROM public.slack_notification_settings)::int, 1, '初期行が 1 件ある');

-- ===== accounting =====
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

SELECT is((SELECT count(*) FROM public.slack_notification_settings)::int, 1, 'accounting は閲覧できる');
WITH u AS (UPDATE public.slack_notification_settings SET matter_notice_header = '更新' RETURNING 1)
SELECT is((SELECT count(*) FROM u)::int, 1, 'accounting は更新できる');
SELECT throws_ok(
  $$UPDATE public.slack_notification_settings SET matter_notice_body_template = '{matter}'$$,
  '23514', NULL, '{message} を含まない本文は CHECK で拒否される');
SELECT throws_ok(
  $$UPDATE public.slack_notification_settings SET matter_notice_body_template = '{message}'$$,
  '23514', NULL, '{assignee} を含まない本文は CHECK で拒否される');
SELECT throws_ok(
  $$INSERT INTO public.slack_notification_settings (id) VALUES (2)$$,
  '42501', NULL, 'accounting は INSERT できない');
SELECT throws_ok(
  $$DELETE FROM public.slack_notification_settings$$,
  '42501', NULL, 'accounting は DELETE できない');

-- ===== admin =====
SELECT set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
WITH u AS (UPDATE public.slack_notification_settings SET matter_notice_header = '管理者更新' RETURNING 1)
SELECT is((SELECT count(*) FROM u)::int, 1, 'admin は更新できる');

-- ===== teamleader (public + flag) =====
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM public.slack_notification_settings)::int, 0, 'teamleader は閲覧できない');
WITH u AS (UPDATE public.slack_notification_settings SET matter_notice_header = 'x' RETURNING 1)
SELECT is((SELECT count(*) FROM u)::int, 0, 'teamleader は更新できない');

-- ===== public =====
SELECT set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM public.slack_notification_settings)::int, 0, 'public は閲覧できない');

SELECT * FROM finish();
ROLLBACK;
