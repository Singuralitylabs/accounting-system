-- pgTAP tests for all-team read access of teamleaders to profit and loss data (migration 40)
-- Run: supabase test db (local Supabase running; docs/testing.md 3.8)
BEGIN;
SELECT plan(27);

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'acc@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'tla@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'tlb@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'pub@example.com');
INSERT INTO public.profiles (user_id, email, name, class, team) VALUES
  ('11111111-1111-1111-1111-111111111111', 'acc@example.com', '経理', 'accounting', NULL),
  ('22222222-2222-2222-2222-222222222222', 'tla@example.com', 'リーダーA', 'public', 'Aチーム'),
  ('33333333-3333-3333-3333-333333333333', 'tlb@example.com', 'リーダーB', 'public', 'Bチーム'),
  ('44444444-4444-4444-4444-444444444444', 'pub@example.com', '一般', 'public', 'Bチーム');
-- Teamleaders are the is_teamleader flag on top of class (migration 41)
UPDATE public.profiles SET is_teamleader = true WHERE email IN ('tla@example.com', 'tlb@example.com');

-- One matter per team (A: owned by teamleader A, B: owned by teamleader B), each with a business and a cost row
INSERT INTO public.matters (title, category, team, user_id, start_date)
SELECT v.title, 'テスト', v.team, (SELECT id FROM public.profiles WHERE email = v.email), DATE '2026-10-01'
FROM (VALUES ('A案件', 'Aチーム', 'tla@example.com'), ('B案件', 'Bチーム', 'tlb@example.com')) AS v(title, team, email);
INSERT INTO public.business (name, matter_id, amount)
SELECT '取引先', id, 1000 FROM public.matters;
INSERT INTO public.costs (name, item, payment_target, price, certificate, matter_id)
SELECT 'コスト', '外注費', '支払先', 500, '請求書', id FROM public.matters;

-- Recurring costs / extra entries: team A, team B and org-wide (team IS NULL)
INSERT INTO public.recurring_costs (name, item, price, start_month, team)
VALUES ('定期A', '家賃', 100, DATE '2026-10-01', 'Aチーム'),
       ('定期B', '家賃', 100, DATE '2026-10-01', 'Bチーム'),
       ('定期全体', '家賃', 100, DATE '2026-10-01', NULL);
INSERT INTO public.extra_entries (entry_type, category, entry_date, description, manager_id, team, billing_amount)
SELECT 'income', '協賛金', DATE '2026-10-05', v.description,
       (SELECT id FROM public.profiles WHERE email = 'acc@example.com'), v.team, 1000
FROM (VALUES ('追加A', 'Aチーム'), ('追加B', 'Bチーム'), ('追加全体', NULL)) AS v(description, team);

-- Adjustments / labels on team B rows
INSERT INTO public.profit_loss_adjustments
  (target_month, business_id, adjustment_amount, source_amount_snapshot, reason, adjusted_by)
SELECT DATE '2026-10-01', b.id, 100, 1000, '調整',
       (SELECT id FROM public.profiles WHERE email = 'acc@example.com')
FROM public.business b JOIN public.matters m ON m.id = b.matter_id WHERE m.team = 'Bチーム';
INSERT INTO public.profit_loss_labels (matter_id, label, updated_by)
SELECT id, 'ラベル', (SELECT id FROM public.profiles WHERE email = 'acc@example.com')
FROM public.matters WHERE team = 'Bチーム';

-- A closed month with one team B line
INSERT INTO public.profit_loss_closings (target_month, closed_by, closed_by_name)
SELECT DATE '2026-10-01', id, name FROM public.profiles WHERE email = 'acc@example.com';
INSERT INTO public.profit_loss_closing_lines
  (closing_id, source_type, source_id, matter_id, matter_user_id, matter_title, name, category, team,
   source_amount, adjustment_amount, actual_amount)
SELECT c.id, 'business', b.id, m.id, m.user_id, m.title, '取引先', 'テスト', m.team, 1000, 0, 1000
FROM public.profit_loss_closings c, public.business b JOIN public.matters m ON m.id = b.matter_id
WHERE m.team = 'Bチーム';

-- ===== teamleader A: read every team, write nothing outside own scope =====
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

SELECT is((SELECT count(*) FROM public.matters)::int, 2, 'teamleader は他チームの案件も閲覧できる');
SELECT is((SELECT count(*) FROM public.business)::int, 2, 'teamleader は他チームの売上も閲覧できる');
SELECT is((SELECT count(*) FROM public.costs)::int, 2, 'teamleader は他チームの案件費用も閲覧できる');
SELECT is((SELECT count(*) FROM public.recurring_costs)::int, 3, 'teamleader は他チーム・全体共通の定期費用も閲覧できる');
SELECT is((SELECT count(*) FROM public.extra_entries)::int, 3, 'teamleader は他チーム・全体共通の経理追加収支も閲覧できる');
SELECT is((SELECT count(*) FROM public.profit_loss_adjustments)::int, 1, 'teamleader は他チームの損益調整も閲覧できる');
SELECT is((SELECT count(*) FROM public.profit_loss_labels)::int, 1, 'teamleader は他チームの表示タイトルも閲覧できる');
SELECT is((SELECT count(*) FROM public.profit_loss_closing_lines)::int, 1, 'teamleader は他チームの確定明細も閲覧できる');

WITH u AS (UPDATE public.matters SET title = 'x' WHERE team = 'Bチーム' RETURNING 1)
SELECT is((SELECT count(*) FROM u)::int, 0, 'teamleader は他チームの案件を更新できない');
WITH d AS (DELETE FROM public.matters WHERE team = 'Bチーム' RETURNING 1)
SELECT is((SELECT count(*) FROM d)::int, 0, 'teamleader は他チームの案件を削除できない');
WITH u AS (UPDATE public.business SET amount = 1
  WHERE matter_id IN (SELECT id FROM public.matters WHERE team = 'Bチーム') RETURNING 1)
SELECT is((SELECT count(*) FROM u)::int, 0, 'teamleader は他チームの売上を更新できない');
WITH u AS (UPDATE public.costs SET price = 1
  WHERE matter_id IN (SELECT id FROM public.matters WHERE team = 'Bチーム') RETURNING 1)
SELECT is((SELECT count(*) FROM u)::int, 0, 'teamleader は他チームの案件費用を更新できない');
WITH u AS (UPDATE public.recurring_costs SET price = 1 RETURNING 1)
SELECT is((SELECT count(*) FROM u)::int, 0, 'teamleader は定期費用を更新できない');
WITH u AS (UPDATE public.extra_entries SET description = 'x' RETURNING 1)
SELECT is((SELECT count(*) FROM u)::int, 0, 'teamleader は経理追加収支を更新できない');
WITH d AS (DELETE FROM public.profit_loss_adjustments RETURNING 1)
SELECT is((SELECT count(*) FROM d)::int, 0, 'teamleader は損益調整を削除できない');
WITH d AS (DELETE FROM public.profit_loss_labels RETURNING 1)
SELECT is((SELECT count(*) FROM d)::int, 0, 'teamleader は表示タイトルを削除できない');
SELECT throws_ok(
  $$INSERT INTO public.recurring_costs (name, item, price, start_month, team)
    VALUES ('不正', '家賃', 1, DATE '2026-11-01', 'Bチーム')$$,
  '42501', NULL, 'teamleader は定期費用を追加できない');
SELECT throws_ok(
  $$INSERT INTO public.profit_loss_adjustments
      (target_month, business_id, adjustment_amount, source_amount_snapshot, reason, adjusted_by)
    SELECT DATE '2026-11-01', b.id, 1, 1000, '不正', p.id
    FROM public.business b, public.profiles p WHERE p.email = 'tla@example.com' LIMIT 1$$,
  '42501', NULL, 'teamleader は損益調整を追加できない');

-- ===== public: own matter only, no profit and loss data =====
SELECT set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM public.matters)::int, 0, 'public は他人の案件を閲覧できない');
SELECT is((SELECT count(*) FROM public.business)::int, 0, 'public は他人の売上を閲覧できない');
SELECT is((SELECT count(*) FROM public.recurring_costs)::int, 0, 'public は定期費用を閲覧できない');
SELECT is((SELECT count(*) FROM public.extra_entries)::int, 0, 'public は経理追加収支を閲覧できない');
SELECT is((SELECT count(*) FROM public.profit_loss_adjustments)::int, 0, 'public は損益調整を閲覧できない');
SELECT is((SELECT count(*) FROM public.profit_loss_labels)::int, 0, 'public は表示タイトルを閲覧できない');
SELECT is((SELECT count(*) FROM public.profit_loss_closing_lines)::int, 0, 'public は確定明細を閲覧できない');

-- ===== accounting: unchanged (all rows) =====
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM public.matters)::int, 2, 'accounting は全案件を閲覧できる');
SELECT is((SELECT count(*) FROM public.extra_entries)::int, 3, 'accounting は全経理追加収支を閲覧できる');

SELECT * FROM finish();
ROLLBACK;
