-- 損益計算書: 確定後の案件変更の反映・見送り（Issue #149）
--
-- 月次収支確定（migration 27、Issue #148）で確定済みの月はスナップショットを表示する
-- （= 確定後の案件の変更はすぐには反映しない）。本マイグレーションでは、確定後に
-- 案件側で起きた変更（確定明細とライブ集計の差分）を経理が明細ごとに「反映」または
-- 「見送り」できるようにする。
--
-- 差分の算出自体は TypeScript の純粋関数（app/utils/profitLossDiff.ts）で行い、
-- DB トリガーや変更フラグは使わない（matters.has_updates の差し戻し検知とは目的が
-- 異なるためフラグも共有しない）。DB に持つのは次の 2 つだけ:
--   - profit_loss_closing_dismissals: 見送り記録（見送った時点のライブの状態）
--   - apply_profit_loss_closing_diffs: 選択した明細の確定明細の置き換え（反映）
--
-- 反映・見送りは Server Action がサーバ側でライブ集計し直した値を渡す（クライアントから
-- 送られた金額・状態は使わない。app/utils/supabase/profitLossClosings.ts）。
-- 詳細設計: docs/database.md 3.17 / 5.15, Issue #149

CREATE TABLE profit_loss_closing_dismissals (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  closing_id         bigint NOT NULL REFERENCES profit_loss_closings (id) ON DELETE CASCADE,
  source_type        text NOT NULL CHECK (source_type IN ('business', 'cost')),
  source_id          bigint NOT NULL,
  -- 見送った時点のライブの状態。現在のライブの状態と一致する間だけ「見送り済み」として
  -- アラート・件数から外す（見送り後にさらに変更されたら再び未処理の差分に戻る）
  live_present       boolean NOT NULL,
  live_actual_amount numeric(15,2),
  live_team          text,
  live_category      text,
  dismissed_by       bigint NOT NULL REFERENCES profiles (id),
  dismissed_by_name  text NOT NULL,
  dismissed_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profit_loss_closing_dismissals_source_key
    UNIQUE (closing_id, source_type, source_id),
  -- ライブに存在する明細は金額・チーム・分類を持ち、存在しない（削除・他月へ移動・
  -- 下書きに戻された）明細は持たない
  CONSTRAINT profit_loss_closing_dismissals_live_check CHECK (
    (live_present AND live_actual_amount IS NOT NULL AND live_team IS NOT NULL
      AND live_category IS NOT NULL) OR
    (NOT live_present AND live_actual_amount IS NULL AND live_team IS NULL
      AND live_category IS NULL)
  )
);

COMMENT ON TABLE profit_loss_closing_dismissals IS '損益計算書の確定後の変更の見送り記録（Issue #149）。確定明細とライブ集計の差分のうち、経理が「見送る」とした明細ごとに、見送った時点のライブの状態を保持する。現在のライブの状態と一致する間は見送り済みとしてアラートから外し、異なれば未処理の差分に戻す。反映・確定解除（CASCADE）・再確定で削除する';

CREATE INDEX IF NOT EXISTS idx_profit_loss_closing_dismissals_dismissed_by
  ON profit_loss_closing_dismissals (dismissed_by);

ALTER TABLE profit_loss_closing_dismissals ENABLE ROW LEVEL SECURITY;

-- SELECT / INSERT / UPDATE / DELETE とも経理担当者・管理者のみ
-- （チームリーダーには確定値のみ表示し、アラート・差分は見せない）。
-- dismissed_by は呼び出し本人に限る（なりすまし防止）
CREATE POLICY "profit_loss_closing_dismissals_select_policy" ON profit_loss_closing_dismissals
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'));

CREATE POLICY "profit_loss_closing_dismissals_insert_policy" ON profit_loss_closing_dismissals
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_user_class() IN ('admin', 'accounting')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profit_loss_closing_dismissals.dismissed_by
      AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "profit_loss_closing_dismissals_update_policy" ON profit_loss_closing_dismissals
  FOR UPDATE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'))
  WITH CHECK (
    public.auth_user_class() IN ('admin', 'accounting')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profit_loss_closing_dismissals.dismissed_by
      AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "profit_loss_closing_dismissals_delete_policy" ON profit_loss_closing_dismissals
  FOR DELETE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'));

-- ===== 再確定で見送り記録も削除する =====
-- save_profit_loss_closing（migration 27）に見送り記録の全削除を加える。
-- 再確定は最新のライブ集計でスナップショットを取り直すため、それまでの見送りは意味を失う
CREATE OR REPLACE FUNCTION public.save_profit_loss_closing(
  p_target_month date,
  p_lines jsonb
)
RETURNS TABLE (id bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_closing_id bigint;
  v_profile_id bigint;
  v_profile_name text;
BEGIN
  SELECT p.id, p.name INTO v_profile_id, v_profile_name
  FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'プロフィールが見つかりません';
  END IF;

  INSERT INTO public.profit_loss_closings
    (target_month, closed_by, closed_by_name, closed_at,
     refreshed_by, refreshed_by_name, refreshed_at)
  VALUES (p_target_month, v_profile_id, v_profile_name, now(), NULL, NULL, NULL)
  ON CONFLICT (target_month) DO UPDATE SET
    closed_by = EXCLUDED.closed_by,
    closed_by_name = EXCLUDED.closed_by_name,
    closed_at = EXCLUDED.closed_at,
    refreshed_by = NULL,
    refreshed_by_name = NULL,
    refreshed_at = NULL
  RETURNING profit_loss_closings.id INTO v_closing_id;

  DELETE FROM public.profit_loss_closing_dismissals
  WHERE closing_id = v_closing_id;

  DELETE FROM public.profit_loss_closing_lines
  WHERE closing_id = v_closing_id;

  INSERT INTO public.profit_loss_closing_lines
    (closing_id, source_type, source_id, matter_id, matter_user_id, matter_title, name, category,
     item, team, entry_type, entry_date, payment_cycle, source_amount,
     adjustment_amount, actual_amount, adjustment_reason, billing_amount,
     expense_amount)
  SELECT
    v_closing_id, l.source_type, l.source_id, l.matter_id, l.matter_user_id, l.matter_title, l.name,
    l.category, l.item, l.team, l.entry_type, l.entry_date, l.payment_cycle,
    l.source_amount, l.adjustment_amount, l.actual_amount, l.adjustment_reason,
    l.billing_amount, l.expense_amount
  FROM jsonb_to_recordset(p_lines) AS l(
    source_type text, source_id bigint, matter_id bigint, matter_user_id bigint, matter_title text,
    name text, category text, item text, team text, entry_type text,
    entry_date date, payment_cycle text, source_amount numeric,
    adjustment_amount numeric, actual_amount numeric, adjustment_reason text,
    billing_amount numeric, expense_amount numeric
  );

  RETURN QUERY SELECT v_closing_id;
END;
$$;

-- ===== 反映（選択した明細の確定明細を最新の値に置き換える） =====
-- p_upsert_lines: ライブに存在する明細（追加・金額変更・区分変更）の最新の値
--   （save_profit_loss_closing の p_lines と同じ形。source_type は business / cost のみ）
-- p_delete_keys: ライブに存在しない明細（削除・他月へ移動・下書きに戻された）の
--   {source_type, source_id} の配列
-- 確定明細の upsert / delete、該当する見送り記録の削除、反映者・反映日時の更新を
-- 1 トランザクションで行う（確定者・確定日時は保持する）。SECURITY INVOKER のため
-- 書き込み可否は RLS（経理担当者・管理者のみ）がそのまま適用される。
CREATE OR REPLACE FUNCTION public.apply_profit_loss_closing_diffs(
  p_target_month date,
  p_upsert_lines jsonb,
  p_delete_keys jsonb
)
RETURNS TABLE (applied_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_closing_id bigint;
  v_profile_id bigint;
  v_profile_name text;
  v_upserted integer;
  v_deleted integer;
BEGIN
  SELECT p.id, p.name INTO v_profile_id, v_profile_name
  FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'プロフィールが見つかりません';
  END IF;

  SELECT c.id INTO v_closing_id FROM public.profit_loss_closings c
  WHERE c.target_month = p_target_month
  FOR UPDATE;
  IF v_closing_id IS NULL THEN
    RAISE EXCEPTION 'NOT_CLOSED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_upsert_lines) AS l(source_type text)
    WHERE l.source_type NOT IN ('business', 'cost')
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_delete_keys) AS k(source_type text)
    WHERE k.source_type NOT IN ('business', 'cost')
  ) THEN
    RAISE EXCEPTION '反映の対象は案件の売上・費用の明細のみです';
  END IF;

  INSERT INTO public.profit_loss_closing_lines
    (closing_id, source_type, source_id, matter_id, matter_user_id, matter_title, name, category,
     item, team, entry_type, entry_date, payment_cycle, source_amount,
     adjustment_amount, actual_amount, adjustment_reason, billing_amount,
     expense_amount)
  SELECT
    v_closing_id, l.source_type, l.source_id, l.matter_id, l.matter_user_id, l.matter_title, l.name,
    l.category, l.item, l.team, l.entry_type, l.entry_date, l.payment_cycle,
    l.source_amount, l.adjustment_amount, l.actual_amount, l.adjustment_reason,
    l.billing_amount, l.expense_amount
  FROM jsonb_to_recordset(p_upsert_lines) AS l(
    source_type text, source_id bigint, matter_id bigint, matter_user_id bigint, matter_title text,
    name text, category text, item text, team text, entry_type text,
    entry_date date, payment_cycle text, source_amount numeric,
    adjustment_amount numeric, actual_amount numeric, adjustment_reason text,
    billing_amount numeric, expense_amount numeric
  )
  ON CONFLICT (closing_id, source_type, source_id) DO UPDATE SET
    matter_id = EXCLUDED.matter_id,
    matter_user_id = EXCLUDED.matter_user_id,
    matter_title = EXCLUDED.matter_title,
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    item = EXCLUDED.item,
    team = EXCLUDED.team,
    source_amount = EXCLUDED.source_amount,
    adjustment_amount = EXCLUDED.adjustment_amount,
    actual_amount = EXCLUDED.actual_amount,
    adjustment_reason = EXCLUDED.adjustment_reason;
  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  DELETE FROM public.profit_loss_closing_lines AS cl
  USING jsonb_to_recordset(p_delete_keys) AS k(source_type text, source_id bigint)
  WHERE cl.closing_id = v_closing_id
    AND cl.source_type = k.source_type
    AND cl.source_id = k.source_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 反映した明細の見送り記録は不要になる（差分が解消するため）
  DELETE FROM public.profit_loss_closing_dismissals AS d
  USING (
    SELECT l.source_type, l.source_id
    FROM jsonb_to_recordset(p_upsert_lines) AS l(source_type text, source_id bigint)
    UNION ALL
    SELECT k.source_type, k.source_id
    FROM jsonb_to_recordset(p_delete_keys) AS k(source_type text, source_id bigint)
  ) AS keys
  WHERE d.closing_id = v_closing_id
    AND d.source_type = keys.source_type
    AND d.source_id = keys.source_id;

  UPDATE public.profit_loss_closings
  SET refreshed_by = v_profile_id,
      refreshed_by_name = v_profile_name,
      refreshed_at = now()
  WHERE profit_loss_closings.id = v_closing_id;

  RETURN QUERY SELECT v_upserted + v_deleted;
END;
$$;

COMMENT ON FUNCTION public.apply_profit_loss_closing_diffs(date, jsonb, jsonb) IS
  '確定後の案件変更の反映（Issue #149）。選択された明細だけ確定明細を最新の値に置き換え（upsert / delete）、該当する見送り記録を削除し、反映者・反映日時を記録する（確定者・確定日時は保持）。値はサーバ側でライブ集計し直したものを渡す。書き込みの可否は RLS がそのまま適用される（SECURITY INVOKER）。詳細: docs/database.md 5.15';

REVOKE EXECUTE ON FUNCTION public.apply_profit_loss_closing_diffs(date, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_profit_loss_closing_diffs(date, jsonb, jsonb) TO authenticated;

-- ===== 見送り（選択した差分をその時点のライブの状態で見送る） =====
-- p_dismissals: {source_type, source_id, live_present, live_actual_amount, live_team,
--   live_category} の配列。再見送りは upsert（見送った時点の状態・日時・見送った人を更新）
CREATE OR REPLACE FUNCTION public.dismiss_profit_loss_closing_diffs(
  p_target_month date,
  p_dismissals jsonb
)
RETURNS TABLE (dismissed_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_closing_id bigint;
  v_profile_id bigint;
  v_profile_name text;
  v_count integer;
BEGIN
  SELECT p.id, p.name INTO v_profile_id, v_profile_name
  FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'プロフィールが見つかりません';
  END IF;

  SELECT c.id INTO v_closing_id FROM public.profit_loss_closings c
  WHERE c.target_month = p_target_month;
  IF v_closing_id IS NULL THEN
    RAISE EXCEPTION 'NOT_CLOSED';
  END IF;

  INSERT INTO public.profit_loss_closing_dismissals
    (closing_id, source_type, source_id, live_present, live_actual_amount,
     live_team, live_category, dismissed_by, dismissed_by_name, dismissed_at)
  SELECT
    v_closing_id, d.source_type, d.source_id, d.live_present, d.live_actual_amount,
    d.live_team, d.live_category, v_profile_id, v_profile_name, now()
  FROM jsonb_to_recordset(p_dismissals) AS d(
    source_type text, source_id bigint, live_present boolean,
    live_actual_amount numeric, live_team text, live_category text
  )
  ON CONFLICT (closing_id, source_type, source_id) DO UPDATE SET
    live_present = EXCLUDED.live_present,
    live_actual_amount = EXCLUDED.live_actual_amount,
    live_team = EXCLUDED.live_team,
    live_category = EXCLUDED.live_category,
    dismissed_by = EXCLUDED.dismissed_by,
    dismissed_by_name = EXCLUDED.dismissed_by_name,
    dismissed_at = EXCLUDED.dismissed_at;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count;
END;
$$;

COMMENT ON FUNCTION public.dismiss_profit_loss_closing_diffs(date, jsonb) IS
  '確定後の案件変更の見送り（Issue #149）。選択された明細の見送り記録を、その時点のライブの状態で upsert する。値はサーバ側でライブ集計し直したものを渡す。dismissed_by は auth.uid() から解決する。書き込みの可否は RLS がそのまま適用される（SECURITY INVOKER）。詳細: docs/database.md 5.15';

REVOKE EXECUTE ON FUNCTION public.dismiss_profit_loss_closing_diffs(date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_profit_loss_closing_diffs(date, jsonb) TO authenticated;

-- ===== 見送りの取り消し（未処理の差分に戻す） =====
CREATE OR REPLACE FUNCTION public.undo_profit_loss_closing_dismissals(
  p_target_month date,
  p_keys jsonb
)
RETURNS TABLE (undone_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.profit_loss_closing_dismissals AS d
  USING public.profit_loss_closings AS c,
        jsonb_to_recordset(p_keys) AS k(source_type text, source_id bigint)
  WHERE d.closing_id = c.id
    AND c.target_month = p_target_month
    AND d.source_type = k.source_type
    AND d.source_id = k.source_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count;
END;
$$;

COMMENT ON FUNCTION public.undo_profit_loss_closing_dismissals(date, jsonb) IS
  '確定後の案件変更の見送りの取り消し（Issue #149）。選択された明細の見送り記録を削除し、未処理の差分に戻す。書き込みの可否は RLS がそのまま適用される（SECURITY INVOKER）。詳細: docs/database.md 5.15';

REVOKE EXECUTE ON FUNCTION public.undo_profit_loss_closing_dismissals(date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.undo_profit_loss_closing_dismissals(date, jsonb) TO authenticated;

-- ===== GRANT =====
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profit_loss_closing_dismissals
  TO authenticated, service_role;
REVOKE ALL ON TABLE profit_loss_closing_dismissals FROM anon;
