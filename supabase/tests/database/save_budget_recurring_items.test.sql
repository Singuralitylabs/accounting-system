-- pgTAP tests for save_budget_recurring_items (migrations 45, 46)
-- Run: supabase test db (local Supabase running; docs/testing.md 3.8)
-- A stale updated_at value stands in for "someone else saved the row after it was displayed":
-- inside one test transaction now() does not move, so the trigger cannot produce a real change.
BEGIN;
SELECT plan(30);

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'acc@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'tla@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'pub@example.com');
INSERT INTO public.profiles (user_id, email, name, class, team) VALUES
  ('11111111-1111-1111-1111-111111111111', 'acc@example.com', '経理', 'accounting', NULL),
  ('22222222-2222-2222-2222-222222222222', 'tla@example.com', 'Aメンバー', 'public', 'Aチーム'),
  ('44444444-4444-4444-4444-444444444444', 'pub@example.com', '無所属', 'public', NULL);

INSERT INTO public.budget_recurring_items
  (team, entry_type, category, description, amount, start_month, display_order)
VALUES
  ('Aチーム', 'expense', '外注費', 'a1', 1000, DATE '2026-04-01', 0),
  ('Aチーム', 'expense', '外注費', 'a2', 2000, DATE '2026-04-01', 1),
  ('Aチーム', 'expense', '外注費', 'a3', 3000, DATE '2026-04-01', 2),
  ('Bチーム', 'expense', '外注費', 'b1', 4000, DATE '2026-04-01', 0);

-- Snapshot of a row as the user saw it, reused after the row is deleted
SELECT set_config('test.a2_row', (SELECT to_jsonb(t)::text FROM public.budget_recurring_items t WHERE description = 'a2'), true);

-- ===== own-team member: new + edited + removed in one call =====
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

SELECT lives_ok(
  format($f$SELECT public.save_budget_recurring_items(%L::jsonb)$f$, (
    SELECT jsonb_build_array(
      to_jsonb(e) || '{"state":"edited","description":"a1-edited","amount":1500}'::jsonb,
      to_jsonb(d) || '{"state":"removed"}'::jsonb,
      '{"state":"new","team":"Aチーム","entry_type":"income","category":"セミナー","description":"a-new","amount":500,"manager_id":null,"start_month":"2026-05-01","end_month":null,"display_order":3}'::jsonb
    )
    FROM public.budget_recurring_items e, public.budget_recurring_items d
    WHERE e.description = 'a1' AND d.description = 'a2'
  )),
  '新規・編集・削除を 1 回の呼び出しで保存できる');
SELECT is((SELECT amount FROM public.budget_recurring_items WHERE description = 'a1-edited'), 1500::numeric, '編集した行の列が更新される');
SELECT is((SELECT count(*) FROM public.budget_recurring_items WHERE description = 'a2')::int, 0, '削除した行が消える');
SELECT is((SELECT count(*) FROM public.budget_recurring_items WHERE description = 'a-new')::int, 1, '新規行が追加される');

-- Same shape the app sends for a new row: id null and updated_at an empty string
SELECT lives_ok(
  $$SELECT public.save_budget_recurring_items('[{"state":"new","id":null,"updated_at":"","team":"Aチーム","entry_type":"expense","category":"外注費","description":"a-new-empty-ts","amount":700,"manager_id":null,"start_month":"2026-05-01","end_month":null,"display_order":4}]'::jsonb)$$,
  'updated_at が空文字の新規行も保存できる');
SELECT is((SELECT count(*) FROM public.budget_recurring_items WHERE description = 'a-new-empty-ts')::int, 1, 'updated_at が空文字の新規行が追加される');

-- An edited / removed row without a usable updated_at is invalid input (22023), not a conflict (40001)
SELECT throws_ok(
  format($f$SELECT public.save_budget_recurring_items(%L::jsonb)$f$, (
    SELECT jsonb_build_array(to_jsonb(t) || '{"state":"edited","updated_at":""}'::jsonb)
    FROM public.budget_recurring_items t WHERE t.description = 'a3'
  )),
  '22023', 'updated_at is required for state edited', 'updated_at が空文字の編集行は競合ではなく入力不正として扱う');
SELECT throws_ok(
  format($f$SELECT public.save_budget_recurring_items(%L::jsonb)$f$, (
    SELECT jsonb_build_array(to_jsonb(t) || '{"state":"removed","updated_at":null}'::jsonb)
    FROM public.budget_recurring_items t WHERE t.description = 'a3'
  )),
  '22023', 'updated_at is required for state removed', 'updated_at が null の削除行は競合ではなく入力不正として扱う');

-- ===== conflict aborts everything =====
-- Rows are processed in id order: a1 (valid edit) is written before a3 (stale) raises, so an intact a1
-- proves the earlier write was rolled back.
SELECT throws_ok(
  format($f$SELECT public.save_budget_recurring_items(%L::jsonb)$f$, (
    SELECT jsonb_build_array(
      to_jsonb(ok_row) || '{"state":"edited","description":"rolled-back"}'::jsonb,
      to_jsonb(stale_row) || '{"state":"edited","description":"overwritten","updated_at":"2000-01-01T00:00:00Z"}'::jsonb
    )
    FROM public.budget_recurring_items ok_row, public.budget_recurring_items stale_row
    WHERE ok_row.description = 'a1-edited' AND stale_row.description = 'a3'
  )),
  '40001', 'BUDGET_RECURRING_ITEMS_CONFLICT', '編集した行の updated_at が表示時と違えば競合で中止する');
SELECT is((SELECT count(*) FROM public.budget_recurring_items WHERE description = 'rolled-back')::int, 0, '競合のとき、先に処理された正常な編集も巻き戻される（何も保存されない）');
SELECT is((SELECT count(*) FROM public.budget_recurring_items WHERE description = 'overwritten')::int, 0, '競合した行は上書きされない');

SELECT throws_ok(
  format($f$SELECT public.save_budget_recurring_items(%L::jsonb)$f$, (
    SELECT jsonb_build_array(to_jsonb(e) || '{"state":"removed","updated_at":"2000-01-01T00:00:00Z"}'::jsonb)
    FROM public.budget_recurring_items e WHERE e.description = 'a3'
  )),
  '40001', 'BUDGET_RECURRING_ITEMS_CONFLICT', '削除する行の updated_at が違えば競合で中止する');
SELECT is((SELECT count(*) FROM public.budget_recurring_items WHERE description = 'a3')::int, 1, '競合した削除対象は残る');

SELECT throws_ok(
  format($f$SELECT public.save_budget_recurring_items(%L::jsonb)$f$, (
    SELECT jsonb_build_array(current_setting('test.a2_row')::jsonb || '{"state":"edited","description":"lost"}'::jsonb)
  )),
  '40001', 'BUDGET_RECURRING_ITEMS_CONFLICT', '編集した行が既に削除されていたら競合で中止する');

-- ===== untouched / already deleted rows are ignored =====
SELECT lives_ok(
  format($f$SELECT public.save_budget_recurring_items(%L::jsonb)$f$, (
    SELECT jsonb_build_array(
      to_jsonb(k) || '{"state":"keep","display_order":7,"updated_at":"2000-01-01T00:00:00Z"}'::jsonb,
      current_setting('test.a2_row')::jsonb || '{"state":"keep","display_order":8}'::jsonb,
      current_setting('test.a2_row')::jsonb || '{"state":"removed"}'::jsonb
    )
    FROM public.budget_recurring_items k WHERE k.description = 'a3'
  )),
  '触っていない行の変更・削除済みの行（keep / removed）は無視され、他の行の保存を妨げない');
SELECT is((SELECT display_order FROM public.budget_recurring_items WHERE description = 'a3'), 2, '表示後に変わった keep 行の display_order は書き換えない');

SELECT lives_ok(
  format($f$SELECT public.save_budget_recurring_items(%L::jsonb)$f$, (
    SELECT jsonb_build_array(to_jsonb(k) || '{"state":"keep","display_order":5}'::jsonb)
    FROM public.budget_recurring_items k WHERE k.description = 'a3'
  )),
  'updated_at が一致する keep 行は display_order を更新できる');
SELECT is((SELECT display_order FROM public.budget_recurring_items WHERE description = 'a3'), 5, 'keep 行の display_order が更新される');

-- ===== another team's rows =====
SELECT throws_ok(
  format($f$SELECT public.save_budget_recurring_items(%L::jsonb)$f$, (
    SELECT jsonb_build_array(to_jsonb(b) || '{"state":"edited","description":"hacked"}'::jsonb)
    FROM public.budget_recurring_items b WHERE b.description = 'b1'
  )),
  '42501', NULL, '他チームの行は編集できない');
SELECT throws_ok(
  format($f$SELECT public.save_budget_recurring_items(%L::jsonb)$f$, (
    SELECT jsonb_build_array(to_jsonb(b) || '{"state":"removed"}'::jsonb)
    FROM public.budget_recurring_items b WHERE b.description = 'b1'
  )),
  '42501', NULL, '他チームの行は削除できない');
SELECT lives_ok(
  format($f$SELECT public.save_budget_recurring_items(%L::jsonb)$f$, (
    SELECT jsonb_build_array(to_jsonb(b) || '{"state":"keep","display_order":9}'::jsonb)
    FROM public.budget_recurring_items b WHERE b.description = 'b1'
  )),
  '他チームの keep 行は無視される');
SELECT is((SELECT display_order FROM public.budget_recurring_items WHERE description = 'b1'), 0, '他チームの行は変更されない');
SELECT throws_ok(
  $$SELECT public.save_budget_recurring_items('[{"state":"new","team":"Bチーム","entry_type":"income","category":"セミナー","description":"x","amount":1,"manager_id":null,"start_month":"2026-05-01","end_month":null,"display_order":0}]'::jsonb)$$,
  '42501', NULL, '他チームへの新規追加は RLS で拒否される');
SELECT throws_ok(
  format($f$SELECT public.save_budget_recurring_items(%L::jsonb)$f$, (
    SELECT jsonb_build_array(to_jsonb(e) || '{"state":"edited","team":"Bチーム"}'::jsonb)
    FROM public.budget_recurring_items e WHERE e.description = 'a1-edited'
  )),
  '42501', NULL, '自チームの行を他チームへ付け替えられない');

-- ===== invalid input =====
SELECT throws_ok(
  $$SELECT public.save_budget_recurring_items('{"state":"new"}'::jsonb)$$,
  '22023', NULL, '配列以外は拒否される');
SELECT throws_ok(
  $$SELECT public.save_budget_recurring_items('[{"state":"bogus"}]'::jsonb)$$,
  '22023', NULL, '不明な state は拒否される');

-- ===== member without a team =====
SELECT set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT public.save_budget_recurring_items('[{"state":"new","team":"Aチーム","entry_type":"income","category":"セミナー","description":"x","amount":1,"manager_id":null,"start_month":"2026-05-01","end_month":null,"display_order":0}]'::jsonb)$$,
  '42501', NULL, '所属チーム未設定のユーザーは追加できない');

-- ===== accounting: all teams =====
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SELECT lives_ok(
  format($f$SELECT public.save_budget_recurring_items(%L::jsonb)$f$, (
    SELECT jsonb_build_array(to_jsonb(b) || '{"state":"edited","description":"b1-by-accounting"}'::jsonb)
    FROM public.budget_recurring_items b WHERE b.description = 'b1'
  )),
  '経理は他チームの行も編集できる');
SELECT is((SELECT count(*) FROM public.budget_recurring_items WHERE description = 'b1-by-accounting')::int, 1, '経理の編集が反映される');

-- ===== anon =====
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.save_budget_recurring_items('[]'::jsonb)$$,
  '42501', NULL, 'anon は実行できない');

SELECT * FROM finish();
ROLLBACK;
