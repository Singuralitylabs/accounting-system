-- 損益計算書の月次収支確定（Issue #148）
--
-- 経理からの要望「損益計算書の月毎の収支確定ボタンを追加する」に対応する。
-- 損益計算書は表示のたびに元データからライブ集計しているため、締めた後の月でも
-- 案件の変更がそのまま過去の損益に反映され、経理が確認・報告した数字が後から黙って
-- 変わってしまう。月ごとに「確定」操作を設け、確定時点の明細（スナップショット）を
-- 保存し、確定済みの月はスナップショットから表示する。
--
--   - profit_loss_closings: 月の確定ヘッダ（1 ヶ月 1 行）
--   - profit_loss_closing_lines: 確定時点の明細（案件の売上・費用、管理費、経理追加収支）
--   - private.is_pl_month_closed(date): 確定済みの月か（RLS の編集ロックから呼ぶ）
--   - 確定中の編集ロック: profit_loss_adjustments（target_month）・extra_entries（entry_date）
--     の書き込みポリシーに「確定済みの月でないこと」を追加する
--   - public.save_profit_loss_closing: 確定（ヘッダの upsert + 明細の全置換）を 1 トランザクションで行う
--
-- 明細の算出（集計）は TypeScript 側（app/utils/profitLossLogic.ts の buildLiveMonthLines）で
-- 行い、SQL 側に集計ロジックを二重実装しない（save_budget_declaration と同じ方式）。
-- 確定の実行時はサーバ側で当月をライブ集計し直してから保存する（クライアントから送られた
-- 金額は使わない。app/utils/supabase/profitLossClosings.ts）。
-- 詳細設計: docs/database.md 3.15 / 3.16 / 5.14 / 5.15, Issue #148

CREATE TABLE profit_loss_closings (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_month     date NOT NULL,
  closed_by        bigint NOT NULL REFERENCES profiles (id),
  -- 確定者・反映者の氏名は確定時点の値を保持する。profiles の RLS ではチームリーダーが
  -- 他チーム（経理担当者等）の氏名を読めないが、確定情報はチームリーダーにも表示するため
  closed_by_name   text NOT NULL,
  closed_at        timestamptz NOT NULL DEFAULT now(),
  refreshed_by     bigint REFERENCES profiles (id),
  refreshed_by_name text,
  refreshed_at     timestamptz,
  inserted_at      timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- profit_loss_adjustments.target_month と同じく月初日を強制する
  CONSTRAINT profit_loss_closings_target_month_check
    CHECK (target_month = date_trunc('month', target_month)::date),
  CONSTRAINT profit_loss_closings_target_month_key UNIQUE (target_month),
  -- 反映者・反映日時・反映者名は揃って NULL か揃って NOT NULL
  CONSTRAINT profit_loss_closings_refreshed_check
    CHECK (num_nulls(refreshed_by, refreshed_by_name, refreshed_at) IN (0, 3))
);

COMMENT ON TABLE profit_loss_closings IS '損益計算書の月次収支確定のヘッダ（Issue #148）。1 ヶ月 1 行。行があれば target_month の月は確定済みで、損益計算書は profit_loss_closing_lines（確定時点のスナップショット）から表示する。確定解除は行の削除（明細・見送り記録は CASCADE）。金額は持たないため SELECT はログインユーザー全員に許可する';

CREATE INDEX IF NOT EXISTS idx_profit_loss_closings_closed_by
  ON profit_loss_closings (closed_by);
CREATE INDEX IF NOT EXISTS idx_profit_loss_closings_refreshed_by
  ON profit_loss_closings (refreshed_by);

CREATE TRIGGER update_profit_loss_closings_updated_at
    BEFORE UPDATE ON profit_loss_closings
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE profit_loss_closing_lines (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  closing_id        bigint NOT NULL REFERENCES profit_loss_closings (id) ON DELETE CASCADE,
  source_type       text NOT NULL
    CHECK (source_type IN ('business', 'cost', 'recurring_cost', 'extra_entry')),
  -- 元の行（business / costs / recurring_costs / extra_entries の id）。元の行や案件が
  -- 削除されても確定値を残すため FK は張らない
  source_id         bigint NOT NULL,
  matter_id         bigint,
  matter_title      text,
  name              text NOT NULL,       -- 取引先名 / コスト名 / 定期費用名 / 経理追加収支の内容
  category          text,                -- 案件の分類 / 経理追加収支の分類
  item              text,                -- 品目（costs）/ 費目（recurring_costs）
  team              text,                -- 案件のチーム / 定期費用・経理追加収支のチーム（NULL = 全体共通）
  entry_type        text,                -- 経理追加収支の種別（income / expense）
  entry_date        date,                -- 経理追加収支の日付
  payment_cycle     text,                -- 定期費用の支払サイクル
  source_amount     numeric(15,2),       -- 元データ金額（案件の売上・費用、管理費）
  adjustment_amount numeric(15,2),       -- 損益調整の差分
  actual_amount     numeric(15,2),       -- 実績額（= 元データ + 調整）
  adjustment_reason text,                -- 調整理由（調整なしは NULL）
  billing_amount    numeric(15,2),       -- 経理追加収支の請求額
  expense_amount    numeric(15,2),       -- 経理追加収支の経費
  CONSTRAINT profit_loss_closing_lines_source_key
    UNIQUE (closing_id, source_type, source_id),
  -- 種別ごとに集計・表示に必要な列が揃っていることを担保する
  CONSTRAINT profit_loss_closing_lines_fields_check CHECK (
    (source_type IN ('business', 'cost')
      AND matter_id IS NOT NULL AND matter_title IS NOT NULL
      AND category IS NOT NULL AND team IS NOT NULL
      AND (source_type = 'business' OR item IS NOT NULL)
      AND source_amount IS NOT NULL AND adjustment_amount IS NOT NULL
      AND actual_amount IS NOT NULL) OR
    (source_type = 'recurring_cost'
      AND item IS NOT NULL AND payment_cycle IS NOT NULL
      AND source_amount IS NOT NULL AND adjustment_amount IS NOT NULL
      AND actual_amount IS NOT NULL) OR
    (source_type = 'extra_entry'
      AND entry_type IN ('income', 'expense') AND category IS NOT NULL)
  )
);

COMMENT ON TABLE profit_loss_closing_lines IS '損益計算書の月次収支確定の明細（Issue #148）。確定時点の案件の売上・費用、管理費（定期費用）、経理追加収支を 1 行ずつ保持する（実績額・調整理由を含む）。source_id / matter_id には FK を張らない（元の行が削除されても確定値を残すため）。JSON 1 カラムにまとめず正規化しているのは、チームリーダー向けの行単位 RLS（自チーム＋全体共通のみ）と、変更検知（Issue #149）の明細単位の突き合わせのため';

-- closing_id の索引は UNIQUE (closing_id, source_type, source_id) の先頭列で兼ねる

-- ===== 確定済み判定 =====
-- RLS（profit_loss_adjustments / extra_entries の編集ロック）から呼ぶ。
-- profit_loss_closings の SELECT はログインユーザー全員に許可しているが、RLS 評価の
-- 経路に依存しないよう SECURITY DEFINER にし、既存の private.* 関数と同じく
-- PostgREST に公開しない private スキーマに置く。
-- 引数は月内の任意の日付でよい（月初日に丸めて判定する）。NULL（日付未入力の経理追加収支）は
-- 確定の対象外のため false。
CREATE OR REPLACE FUNCTION private.is_pl_month_closed(p_month date)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT p_month IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profit_loss_closings c
    WHERE c.target_month = date_trunc('month', p_month)::date
  )
$$;

COMMENT ON FUNCTION private.is_pl_month_closed(date) IS
  '指定日の属する月が損益計算書で確定済みか（Issue #148）。NULL は false。profit_loss_adjustments / extra_entries の編集ロック（RLS）から呼ぶ。詳細: docs/database.md 5.14';

REVOKE EXECUTE ON FUNCTION private.is_pl_month_closed(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_pl_month_closed(date) TO authenticated;

-- ===== RLS: profit_loss_closings =====
ALTER TABLE profit_loss_closings ENABLE ROW LEVEL SECURITY;

-- ログインユーザー全員（担当者の案件編集時に「確定済みの月」の注意表示を出すため。
-- ヘッダには金額を持たない）
CREATE POLICY "profit_loss_closings_select_policy" ON profit_loss_closings
  FOR SELECT TO authenticated
  USING (true);

-- 書き込みは経理担当者・管理者のみ。closed_by / refreshed_by は呼び出し本人に限る
-- （PostgREST 経由で任意の profiles.id を指定したなりすましを防ぐ）
CREATE POLICY "profit_loss_closings_insert_policy" ON profit_loss_closings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_user_class() IN ('admin', 'accounting')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profit_loss_closings.closed_by
      AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "profit_loss_closings_update_policy" ON profit_loss_closings
  FOR UPDATE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'))
  WITH CHECK (
    public.auth_user_class() IN ('admin', 'accounting')
    AND (
      profit_loss_closings.refreshed_by IS NULL
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = profit_loss_closings.refreshed_by
        AND p.user_id = (select auth.uid())
      )
    )
  );

CREATE POLICY "profit_loss_closings_delete_policy" ON profit_loss_closings
  FOR DELETE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'));

-- ===== RLS: profit_loss_closing_lines =====
ALTER TABLE profit_loss_closing_lines ENABLE ROW LEVEL SECURITY;

-- 経理担当者・管理者は全行、チームリーダーは自チームの行＋全体共通（team IS NULL）の行のみ
-- （ライブ集計時の matters / recurring_costs / extra_entries の RLS と同じ範囲）
CREATE POLICY "profit_loss_closing_lines_select_policy" ON profit_loss_closing_lines
  FOR SELECT TO authenticated
  USING (
    public.auth_user_class() IN ('admin', 'accounting')
    OR (
      public.auth_user_class() = 'teamleader'
      AND public.auth_user_team() IS NOT NULL
      AND (
        profit_loss_closing_lines.team IS NULL
        OR profit_loss_closing_lines.team = public.auth_user_team()
      )
    )
  );

CREATE POLICY "profit_loss_closing_lines_insert_policy" ON profit_loss_closing_lines
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_user_class() IN ('admin', 'accounting'));

CREATE POLICY "profit_loss_closing_lines_update_policy" ON profit_loss_closing_lines
  FOR UPDATE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'))
  WITH CHECK (public.auth_user_class() IN ('admin', 'accounting'));

CREATE POLICY "profit_loss_closing_lines_delete_policy" ON profit_loss_closing_lines
  FOR DELETE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'));

-- ===== 確定中の編集ロック: profit_loss_adjustments =====
-- target_month が確定済みの月の調整の追加・更新・削除を拒否する。
-- 案件の明細・定期費用の削除に伴う CASCADE 削除は参照整合性のアクションで、RLS は
-- 適用されないため妨げられない。
DROP POLICY "profit_loss_adjustments_insert_policy" ON profit_loss_adjustments;
DROP POLICY "profit_loss_adjustments_update_policy" ON profit_loss_adjustments;
DROP POLICY "profit_loss_adjustments_delete_policy" ON profit_loss_adjustments;

CREATE POLICY "profit_loss_adjustments_insert_policy" ON profit_loss_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_user_class() IN ('admin', 'accounting')
    AND NOT private.is_pl_month_closed(profit_loss_adjustments.target_month)
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profit_loss_adjustments.adjusted_by
      AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "profit_loss_adjustments_update_policy" ON profit_loss_adjustments
  FOR UPDATE TO authenticated
  USING (
    public.auth_user_class() IN ('admin', 'accounting')
    AND NOT private.is_pl_month_closed(profit_loss_adjustments.target_month)
  )
  WITH CHECK (
    public.auth_user_class() IN ('admin', 'accounting')
    AND NOT private.is_pl_month_closed(profit_loss_adjustments.target_month)
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profit_loss_adjustments.adjusted_by
      AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "profit_loss_adjustments_delete_policy" ON profit_loss_adjustments
  FOR DELETE TO authenticated
  USING (
    public.auth_user_class() IN ('admin', 'accounting')
    AND NOT private.is_pl_month_closed(profit_loss_adjustments.target_month)
  );

-- ===== 確定中の編集ロック: extra_entries =====
-- entry_date が確定済みの月のエントリの追加・更新・削除、確定済みの月へ / からの日付の
-- 変更を拒否する（UPDATE は USING = 変更前の月、WITH CHECK = 変更後の月）。
-- entry_date が NULL（月未確定）の行は確定の対象外（is_pl_month_closed(NULL) = false）。
-- 既存の条件（経理担当者・管理者のみ）は migration 14 / 08 と同じ形のまま残す。
DROP POLICY "extra_entries_insert_policy" ON extra_entries;
DROP POLICY "extra_entries_update_policy" ON extra_entries;
DROP POLICY "extra_entries_delete_policy" ON extra_entries;

CREATE POLICY "extra_entries_insert_policy" ON extra_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class IN ('admin', 'accounting')
    )
    AND NOT private.is_pl_month_closed(extra_entries.entry_date)
  );

CREATE POLICY "extra_entries_update_policy" ON extra_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class IN ('admin', 'accounting')
    )
    AND NOT private.is_pl_month_closed(extra_entries.entry_date)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class IN ('admin', 'accounting')
    )
    AND NOT private.is_pl_month_closed(extra_entries.entry_date)
  );

CREATE POLICY "extra_entries_delete_policy" ON extra_entries
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = (select auth.uid())
      AND profiles.class IN ('admin', 'accounting')
    )
    AND NOT private.is_pl_month_closed(extra_entries.entry_date)
  );

-- ===== 実績額修正の保存: 確定済みの月は分かりやすいエラーにする =====
-- 本体は migration 23 と同じ。先頭で確定済みの月を判定し、固定文言の例外
-- （MONTH_CLOSED）を返す（RLS でも拒否されるが、RLS 違反のメッセージは利用者に
-- 意味が伝わらないため）。
CREATE OR REPLACE FUNCTION public.save_profit_loss_adjustment(
  p_business_id bigint,
  p_cost_id bigint,
  p_recurring_cost_id bigint,
  p_target_month date,
  p_actual_amount numeric,
  p_reason text
)
RETURNS TABLE (deleted boolean, source_amount numeric, adjustment_amount numeric)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_source_amount numeric;
  v_actual_amount numeric;
  v_adjustment_amount numeric;
  v_adjusted_by bigint;
BEGIN
  IF num_nonnulls(p_business_id, p_cost_id, p_recurring_cost_id) <> 1 THEN
    RAISE EXCEPTION '調整対象の指定が不正です';
  END IF;

  IF private.is_pl_month_closed(p_target_month) THEN
    RAISE EXCEPTION 'MONTH_CLOSED';
  END IF;

  v_actual_amount := round(p_actual_amount, 2);

  SELECT p.id INTO v_adjusted_by FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_adjusted_by IS NULL THEN
    RAISE EXCEPTION 'プロフィールが見つかりません';
  END IF;

  IF p_business_id IS NOT NULL THEN
    SELECT COALESCE(b.amount, 0) INTO v_source_amount
    FROM public.business b WHERE b.id = p_business_id FOR UPDATE;
  ELSIF p_cost_id IS NOT NULL THEN
    SELECT c.price INTO v_source_amount
    FROM public.costs c WHERE c.id = p_cost_id FOR UPDATE;
  ELSE
    SELECT rc.price INTO v_source_amount
    FROM public.recurring_costs rc WHERE rc.id = p_recurring_cost_id FOR UPDATE;
  END IF;

  IF v_source_amount IS NULL THEN
    RAISE EXCEPTION '対象データが見つかりません';
  END IF;

  v_adjustment_amount := v_actual_amount - v_source_amount;

  IF v_adjustment_amount = 0 THEN
    DELETE FROM public.profit_loss_adjustments
    WHERE target_month = p_target_month
      AND business_id IS NOT DISTINCT FROM p_business_id
      AND cost_id IS NOT DISTINCT FROM p_cost_id
      AND recurring_cost_id IS NOT DISTINCT FROM p_recurring_cost_id;
    RETURN QUERY SELECT true, v_source_amount, 0::numeric;
    RETURN;
  END IF;

  IF btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  IF p_business_id IS NOT NULL THEN
    INSERT INTO public.profit_loss_adjustments
      (target_month, business_id, adjustment_amount, source_amount_snapshot, reason, adjusted_by)
    VALUES (p_target_month, p_business_id, v_adjustment_amount, v_source_amount, btrim(p_reason), v_adjusted_by)
    ON CONFLICT (business_id, target_month) WHERE business_id IS NOT NULL
    DO UPDATE SET
      adjustment_amount = EXCLUDED.adjustment_amount,
      source_amount_snapshot = EXCLUDED.source_amount_snapshot,
      reason = EXCLUDED.reason,
      adjusted_by = EXCLUDED.adjusted_by;
  ELSIF p_cost_id IS NOT NULL THEN
    INSERT INTO public.profit_loss_adjustments
      (target_month, cost_id, adjustment_amount, source_amount_snapshot, reason, adjusted_by)
    VALUES (p_target_month, p_cost_id, v_adjustment_amount, v_source_amount, btrim(p_reason), v_adjusted_by)
    ON CONFLICT (cost_id, target_month) WHERE cost_id IS NOT NULL
    DO UPDATE SET
      adjustment_amount = EXCLUDED.adjustment_amount,
      source_amount_snapshot = EXCLUDED.source_amount_snapshot,
      reason = EXCLUDED.reason,
      adjusted_by = EXCLUDED.adjusted_by;
  ELSE
    INSERT INTO public.profit_loss_adjustments
      (target_month, recurring_cost_id, adjustment_amount, source_amount_snapshot, reason, adjusted_by)
    VALUES (p_target_month, p_recurring_cost_id, v_adjustment_amount, v_source_amount, btrim(p_reason), v_adjusted_by)
    ON CONFLICT (recurring_cost_id, target_month) WHERE recurring_cost_id IS NOT NULL
    DO UPDATE SET
      adjustment_amount = EXCLUDED.adjustment_amount,
      source_amount_snapshot = EXCLUDED.source_amount_snapshot,
      reason = EXCLUDED.reason,
      adjusted_by = EXCLUDED.adjusted_by;
  END IF;

  RETURN QUERY SELECT false, v_source_amount, v_adjustment_amount;
END;
$$;

-- ===== 確定（スナップショットの保存） =====
-- ヘッダの upsert（再確定では確定者・確定日時を更新し、反映者・反映日時をクリアする）と
-- 明細の全置換を 1 回の関数呼び出し（= 1 トランザクション）で行う。
-- 途中で失敗した場合は確定前の状態に完全にロールバックされる。
-- SECURITY INVOKER のため、書き込みの可否は上記 RLS（経理担当者・管理者のみ）が
-- そのまま適用される。closed_by / closed_by_name は auth.uid() から解決し、
-- クライアントからは受け取らない。
-- p_lines は明細オブジェクトの配列（キーは profit_loss_closing_lines の列名。
-- app/utils/profitLossClosing.ts の monthLinesToClosingRows が組み立てる）。
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

  DELETE FROM public.profit_loss_closing_lines
  WHERE closing_id = v_closing_id;

  INSERT INTO public.profit_loss_closing_lines
    (closing_id, source_type, source_id, matter_id, matter_title, name, category,
     item, team, entry_type, entry_date, payment_cycle, source_amount,
     adjustment_amount, actual_amount, adjustment_reason, billing_amount,
     expense_amount)
  SELECT
    v_closing_id, l.source_type, l.source_id, l.matter_id, l.matter_title, l.name,
    l.category, l.item, l.team, l.entry_type, l.entry_date, l.payment_cycle,
    l.source_amount, l.adjustment_amount, l.actual_amount, l.adjustment_reason,
    l.billing_amount, l.expense_amount
  FROM jsonb_to_recordset(p_lines) AS l(
    source_type text, source_id bigint, matter_id bigint, matter_title text,
    name text, category text, item text, team text, entry_type text,
    entry_date date, payment_cycle text, source_amount numeric,
    adjustment_amount numeric, actual_amount numeric, adjustment_reason text,
    billing_amount numeric, expense_amount numeric
  );

  RETURN QUERY SELECT v_closing_id;
END;
$$;

COMMENT ON FUNCTION public.save_profit_loss_closing(date, jsonb) IS
  '損益計算書の月次収支確定（Issue #148）。ヘッダ（profit_loss_closings）の upsert と明細（profit_loss_closing_lines）の全置換を単一トランザクションで行う。再確定では確定者・確定日時を更新し、反映者・反映日時をクリアする。closed_by は auth.uid() から解決する。書き込みの可否は呼び出し元ロールに対する RLS がそのまま適用される（SECURITY INVOKER）。詳細: docs/database.md 5.15';

REVOKE EXECUTE ON FUNCTION public.save_profit_loss_closing(date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_profit_loss_closing(date, jsonb) TO authenticated;

-- ===== GRANT =====
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profit_loss_closings
  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profit_loss_closing_lines
  TO authenticated, service_role;
REVOKE ALL ON TABLE profit_loss_closings FROM anon;
REVOKE ALL ON TABLE profit_loss_closing_lines FROM anon;
