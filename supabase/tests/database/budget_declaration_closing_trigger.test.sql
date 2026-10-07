-- pgTAP tests for the closed-month write trigger of budget declarations, isolated from RLS
-- Run: supabase test db (local Supabase running; docs/testing.md 3.8)
BEGIN;
SELECT plan(6);

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'acc@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'tla@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'tlb@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'pub@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'adm@example.com');
INSERT INTO public.profiles (user_id, email, name, class, team) VALUES
  ('11111111-1111-1111-1111-111111111111', 'acc@example.com', '経理', 'accounting', NULL),
  ('22222222-2222-2222-2222-222222222222', 'tla@example.com', 'リーダーA', 'public', 'Aチーム'),
  ('33333333-3333-3333-3333-333333333333', 'tlb@example.com', 'リーダーB', 'public', 'Bチーム'),
  ('44444444-4444-4444-4444-444444444444', 'pub@example.com', '一般', 'public', NULL),
  ('55555555-5555-5555-5555-555555555555', 'adm@example.com', '管理者', 'admin', NULL);
-- Teamleaders are the is_teamleader flag on top of class (migration 41)
UPDATE public.profiles SET is_teamleader = true WHERE email IN ('tla@example.com', 'tlb@example.com');

-- October: teams A and B have both declared (one line each)
INSERT INTO public.budget_declarations (target_month, team, declared_by)
SELECT DATE '2026-10-01', t.team, (SELECT id FROM public.profiles WHERE email = 'acc@example.com')
FROM (VALUES ('Aチーム'), ('Bチーム')) AS t(team);
INSERT INTO public.budget_declaration_items (declaration_id, entry_type, category, description, amount)
SELECT d.id, 'income', '協賛金', 'テスト', 1000 FROM public.budget_declarations d;

-- Close October as the table owner (RLS does not apply; the closing insert trigger still runs)
INSERT INTO public.budget_declaration_closings (target_month, closed_by)
SELECT DATE '2026-10-01', id FROM public.profiles WHERE email = 'acc@example.com';

-- November (open) declaration used to test moving a row into the closed month
INSERT INTO public.budget_declarations (target_month, team, declared_by)
SELECT DATE '2026-11-01', 'Aチーム', id FROM public.profiles WHERE email = 'acc@example.com';

-- The RLS closed-month condition raises the same 42501, so within this test transaction only,
-- replace the write policies with ones lacking that condition and check that the trigger alone (MONTH_CLOSED) rejects.
RESET ROLE;
DROP POLICY budget_declarations_insert_policy ON public.budget_declarations;
DROP POLICY budget_declarations_update_policy ON public.budget_declarations;
DROP POLICY budget_declarations_delete_policy ON public.budget_declarations;
DROP POLICY budget_declaration_items_insert_policy ON public.budget_declaration_items;
DROP POLICY budget_declaration_items_update_policy ON public.budget_declaration_items;
DROP POLICY budget_declaration_items_delete_policy ON public.budget_declaration_items;
CREATE POLICY tap_open_declarations ON public.budget_declarations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tap_open_items ON public.budget_declaration_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

SELECT throws_ok(
  $$INSERT INTO public.budget_declarations (target_month, team, declared_by)
    SELECT DATE '2026-10-01', 'Cチーム', id FROM public.profiles WHERE email = 'acc@example.com'$$,
  '42501', 'MONTH_CLOSED', 'トリガー: 確定月のヘッダ INSERT を拒否する');
SELECT throws_ok(
  $$UPDATE public.budget_declarations SET comment = 'x' WHERE target_month = DATE '2026-10-01'$$,
  '42501', 'MONTH_CLOSED', 'トリガー: 確定月のヘッダ UPDATE を拒否する');
SELECT throws_ok(
  $$DELETE FROM public.budget_declarations WHERE target_month = DATE '2026-10-01'$$,
  '42501', 'MONTH_CLOSED', 'トリガー: 確定月のヘッダ DELETE を拒否する');
SELECT throws_ok(
  $$UPDATE public.budget_declarations SET target_month = DATE '2026-10-01' WHERE target_month = DATE '2026-11-01'$$,
  '42501', 'MONTH_CLOSED', 'トリガー: 未確定月から確定月への付け替えを拒否する');
SELECT throws_ok(
  $$INSERT INTO public.budget_declaration_items (declaration_id, entry_type, category, description, amount)
    SELECT id, 'income', '協賛金', 'x', 1 FROM public.budget_declarations WHERE target_month = DATE '2026-10-01' LIMIT 1$$,
  '42501', 'MONTH_CLOSED', 'トリガー: 確定月の明細 INSERT を拒否する');
SELECT throws_ok(
  $$DELETE FROM public.budget_declaration_items$$,
  '42501', 'MONTH_CLOSED', 'トリガー: 確定月の明細 DELETE を拒否する');

SELECT * FROM finish();
ROLLBACK;
