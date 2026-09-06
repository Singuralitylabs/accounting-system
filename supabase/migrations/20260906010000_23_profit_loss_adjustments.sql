-- profit_loss_adjustments: 損益調整（案件の売上・案件費用・管理費の実績額修正）
--
-- 経理からの要望「損益計算書に、月別の収入・支出の編集機能がほしい」（Issue #108）に
-- 対応する。案件（business / costs）・定期費用マスタ（recurring_costs）の元データは
-- 一切書き換えず、対象月ごとの調整（差分）を本テーブルに保持し、損益計算書では
-- 「元データ + 調整 = 実績」として表示・集計する。
-- 元データを直接書き換えない理由:
--   - business / costs は案件ライフサイクル・差し戻し検知の対象で、経理が直接
--     書き換えると担当者の見ている案件が変わり、差し戻し検知が誤発火する
--   - recurring_costs は適用期間で全月に反映されるため、金額欄を直すと全月が
--     変わってしまい、ある月だけの差異を表現できない
-- 詳細設計: docs/database.md 3.13 / 5.12, Issue #108

CREATE TABLE profit_loss_adjustments (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_month           date NOT NULL,
  business_id            bigint REFERENCES business (id) ON DELETE CASCADE,
  cost_id                bigint REFERENCES costs (id) ON DELETE CASCADE,
  recurring_cost_id      bigint REFERENCES recurring_costs (id) ON DELETE CASCADE,
  adjustment_amount      numeric(15,2) NOT NULL,
  source_amount_snapshot numeric(15,2) NOT NULL,
  reason                 text NOT NULL,
  adjusted_by            bigint NOT NULL REFERENCES profiles (id),
  inserted_at            timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- budget_declarations.target_month と同じ理由で月初日を強制する
  CONSTRAINT profit_loss_adjustments_target_month_check
    CHECK (target_month = date_trunc('month', target_month)::date),
  -- 0 は許可しない。実績額が元データと同額になった場合はレコード自体を削除する
  -- （アプリ側の運用。DB は「保存されている調整は必ず差分がある」ことだけを担保する）
  CONSTRAINT profit_loss_adjustments_amount_check
    CHECK (adjustment_amount <> 0),
  -- ポリモーフィック参照にせず実 FK を3本張るため、対象は必ずちょうど1つに限定する
  -- （0個だと調整対象が無い、2個以上だと元データ変更検知がどの行を指すか決まらない）
  CONSTRAINT profit_loss_adjustments_exactly_one_target_check
    CHECK (num_nonnulls(business_id, cost_id, recurring_cost_id) = 1),
  -- 空文字の理由を保存させない（アプリ側でも必須入力にしているが、Server Action の
  -- 直接呼び出しなど経路が増えたときに備えて DB 側でも担保する）
  CONSTRAINT profit_loss_adjustments_reason_check
    CHECK (btrim(reason) <> '')
);

COMMENT ON TABLE profit_loss_adjustments IS '損益調整。対象行（business / costs / recurring_costs のいずれか1つ）× target_month（月初日）ごとに、実績額と元データの差分（adjustment_amount）を保持する。損益計算書は「元データ + adjustment_amount = 実績」として表示・集計する。元データ（business / costs / recurring_costs）は変更しない。source_amount_snapshot は保存時点の元データ金額で、現在の元データ金額と異なる場合は画面に「元データが変更されています」警告を表示する（本テーブルの値は自動追従しない）';
COMMENT ON COLUMN profit_loss_adjustments.adjustment_amount IS '実績額と元データ金額の差分（実績額 − 保存時点の元データ金額）。0 は許可しない（実績額が元データと同額なら調整レコード自体を削除する）';
COMMENT ON COLUMN profit_loss_adjustments.source_amount_snapshot IS '保存時点の元データ金額（business.amount / costs.price / recurring_costs.price のいずれか、対象に応じて1つ）。元データ変更検知用の比較にのみ使う（実績額の計算には現在の元データ金額 + adjustment_amount を使う）';

-- FK 側の索引を兼ねる（UNIQUE インデックスの先頭列を FK 列にしているため、対象行
-- 削除時の CASCADE 検索・Supabase の unindexed_foreign_keys リンタの両方をこれで満たす）。
-- 「対象行 × target_month は1件」（同じ行・同じ月への調整は1件）を保証する。
-- target_month 単独のインデックスは張らない（budget_declarations と同じ理由。損益
-- 計算書は全件取得して月ごとにメモリ上で振り分けるため、target_month 単体の絞り込み
-- クエリは現時点で発生しない）。
CREATE UNIQUE INDEX profit_loss_adjustments_business_id_month_key
  ON profit_loss_adjustments (business_id, target_month)
  WHERE business_id IS NOT NULL;
CREATE UNIQUE INDEX profit_loss_adjustments_cost_id_month_key
  ON profit_loss_adjustments (cost_id, target_month)
  WHERE cost_id IS NOT NULL;
CREATE UNIQUE INDEX profit_loss_adjustments_recurring_cost_id_month_key
  ON profit_loss_adjustments (recurring_cost_id, target_month)
  WHERE recurring_cost_id IS NOT NULL;
-- FK 側の索引（extra_entries.manager_id と同じ方針）
CREATE INDEX IF NOT EXISTS idx_profit_loss_adjustments_adjusted_by
  ON profit_loss_adjustments (adjusted_by);

CREATE TRIGGER update_profit_loss_adjustments_updated_at
    BEFORE UPDATE ON profit_loss_adjustments
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ===== RLS =====
-- 書き込み（INSERT/UPDATE/DELETE）は accounting / admin のみ。
-- SELECT は accounting / admin が全行、teamleader は対象行のチームが自チーム、
-- または全体共通（recurring_costs.team IS NULL）の行のみ（recurring_costs /
-- extra_entries と同じ方針）。
--
-- 調整行自体には team 列が無く、対象（business → matters.team / costs →
-- matters.team / recurring_costs.team）を辿って判定する必要があるため、
-- can_access_team_budget（migration 19）と同じ理由でヘルパー関数へ切り出す。
--
-- pl_adjustment_team は SECURITY DEFINER にする。matters / costs / business の
-- 既存 RLS（teamleader は自チームの行のみ SELECT 可）に判定を委ねると、他チームの
-- 対象行は「見えない」＝ NULL が返り、下の can_view_pl_adjustment が「対象不明 = 全体
-- 共通」として誤って表示を許可してしまう（auth_user_class / auth_user_team と同じ
-- 理由。migration 12 参照）。SECURITY DEFINER で常に実際のチームを取得することで、
-- 「対象行のチームが分からない」状態を作らない。
--
-- 両関数は private スキーマに置く（public に置かないのは auth_user_class /
-- auth_user_team / can_access_team_budget と異なる理由）。この2関数は「呼び出し側が
-- 渡した business_id / cost_id / recurring_cost_id が指す行のチーム（や、そこから
-- 導いた可視性）」を返すため、public に置いて authenticated へ EXECUTE を許可すると
-- PostgREST の /rest/v1/rpc/pl_adjustment_team 経由でどのロールからも直接呼び出せて
-- しまい、SECURITY DEFINER が business_select_policy / costs_select_policy
-- （teamleader を自チームに絞る RLS）を素通りして、他チームの matters.team を返す
-- 情報漏えい経路になる（id を総当たりされれば行の存在有無まで分かる）。
-- private スキーマは supabase/config.toml の [api].schemas に含まれず PostgREST から
-- 直接ルーティングされないため、RLS ポリシーの USING 句からの内部呼び出しのみに限定できる。
CREATE SCHEMA IF NOT EXISTS private;
-- PostgREST 経由での直接公開はされないが、明示的に anon には権限を渡さない
REVOKE ALL ON SCHEMA private FROM anon, authenticated, PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.pl_adjustment_team(
  p_business_id bigint,
  p_cost_id bigint,
  p_recurring_cost_id bigint
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_business_id IS NOT NULL THEN (
      SELECT matters.team FROM public.business
      JOIN public.matters ON matters.id = business.matter_id
      WHERE business.id = p_business_id
    )
    WHEN p_cost_id IS NOT NULL THEN (
      SELECT matters.team FROM public.costs
      JOIN public.matters ON matters.id = costs.matter_id
      WHERE costs.id = p_cost_id
    )
    ELSE (
      SELECT recurring_costs.team FROM public.recurring_costs
      WHERE recurring_costs.id = p_recurring_cost_id
    )
  END
$$;

COMMENT ON FUNCTION private.pl_adjustment_team(bigint, bigint, bigint) IS
  '損益調整（profit_loss_adjustments）の対象行が属するチームを返す。business / costs は matters.team 経由（NOT NULL）、recurring_costs は team 列を直接参照する（NULL 可 = 全体共通）。matters / costs / business 自体の RLS に依存しないよう SECURITY DEFINER にしている。他人の行のチームを返す関数のため、PostgREST に公開される public スキーマには置かない（private スキーマ）。詳細: docs/database.md 5.12';

CREATE OR REPLACE FUNCTION private.can_view_pl_adjustment(
  p_business_id bigint,
  p_cost_id bigint,
  p_recurring_cost_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT public.auth_user_class() IN ('admin', 'accounting')
      OR (
        public.auth_user_class() = 'teamleader'
        AND public.auth_user_team() IS NOT NULL
        AND (
          private.pl_adjustment_team(p_business_id, p_cost_id, p_recurring_cost_id) IS NULL
          OR private.pl_adjustment_team(p_business_id, p_cost_id, p_recurring_cost_id) = public.auth_user_team()
        )
      )
$$;

COMMENT ON FUNCTION private.can_view_pl_adjustment(bigint, bigint, bigint) IS
  '損益調整（profit_loss_adjustments）の SELECT 判定。経理・管理者は全行、チームリーダーは自チームの対象行 + 全体共通（recurring_costs.team IS NULL）の対象行のみ true。pl_adjustment_team と同じ理由で private スキーマに置く（他チームか否かの boolean でも、任意の id を総当たりする列挙攻撃の材料になり得るため）。詳細: docs/database.md 5.12';

-- private スキーマは PostgREST に公開されないため、EXECUTE を authenticated に
-- 許可しても直接の RPC 呼び出しはできない（RLS ポリシー内部からの呼び出しのみ）
REVOKE EXECUTE ON FUNCTION private.pl_adjustment_team(bigint, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.pl_adjustment_team(bigint, bigint, bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION private.can_view_pl_adjustment(bigint, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_view_pl_adjustment(bigint, bigint, bigint) TO authenticated;

ALTER TABLE profit_loss_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profit_loss_adjustments_select_policy" ON profit_loss_adjustments
  FOR SELECT TO authenticated
  USING (
    private.can_view_pl_adjustment(business_id, cost_id, recurring_cost_id)
  );

-- 書き込みは accounting / admin のみ（対象行のチームは問わない。extra_entries /
-- recurring_costs と同じ方針で、チームリーダーには一切の書き込みを許可しない）。
-- adjusted_by は PostgREST 経由では任意の profiles.id を指定できてしまうため、
-- WITH CHECK で「adjusted_by が呼び出し本人の profiles.id と一致すること」も
-- 併せて要求する（budget_declarations_insert_policy と同じ理由。あちらは
-- チーム協業のため UPDATE 側は縛っていないが、adjusted_by はアプリが常に
-- 呼び出し本人の id を送るため、UPDATE も含めて縛ってもアプリの動作を妨げない）
CREATE POLICY "profit_loss_adjustments_insert_policy" ON profit_loss_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_user_class() IN ('admin', 'accounting')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profit_loss_adjustments.adjusted_by
      AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "profit_loss_adjustments_update_policy" ON profit_loss_adjustments
  FOR UPDATE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'))
  WITH CHECK (
    public.auth_user_class() IN ('admin', 'accounting')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profit_loss_adjustments.adjusted_by
      AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "profit_loss_adjustments_delete_policy" ON profit_loss_adjustments
  FOR DELETE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'));

-- ===== 実績額修正の原子的な保存 =====
-- app 側で「元データ金額の取得 → 差分計算 → INSERT/UPDATE」を複数クエリに分けて
-- 行うと、取得から書き込みまでの間に他の変更が挟まる競合の余地がある
-- （元データの金額が保存の直前に変わる、2人の経理担当者が同時に同じ対象へ保存する等）。
-- 本関数は対象行を SELECT ... FOR UPDATE でロックし、差分計算と
-- INSERT ... ON CONFLICT DO UPDATE（部分 UNIQUE インデックスを一意性制約として
-- 利用した upsert）を単一トランザクション（関数呼び出し1回）内で行うことで、
-- この競合を解消する。
--
-- SECURITY DEFINER にはしない（既定の SECURITY INVOKER のまま）。対象行の
-- SELECT・profit_loss_adjustments への書き込みはいずれも呼び出し元のロールで
-- RLS がそのまま適用されるため、経理担当者・管理者以外は書き込みポリシーで
-- 拒否される（pl_adjustment_team / can_view_pl_adjustment とは異なり、対象データの
-- SELECT 自体は accounting/admin なら全行に許可されているため、RLS 迂回の懸念はない）。
--
-- adjusted_by はクライアントから受け取らず、関数内で auth.uid() から解決する。
-- PostgREST 経由で adjusted_by に任意の profiles.id を渡されてなりすまされることを
-- 防ぐ（上記 INSERT/UPDATE ポリシーの WITH CHECK と二重に担保する）。
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
  v_adjustment_amount numeric;
  v_adjusted_by bigint;
BEGIN
  IF num_nonnulls(p_business_id, p_cost_id, p_recurring_cost_id) <> 1 THEN
    RAISE EXCEPTION '調整対象の指定が不正です';
  END IF;

  SELECT p.id INTO v_adjusted_by FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_adjusted_by IS NULL THEN
    RAISE EXCEPTION 'プロフィールが見つかりません';
  END IF;

  -- 対象行をロックしたうえで元データ金額を取得する（このトランザクションが
  -- コミットするまで、他の同時実行はこの行の更新を待つ）
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

  v_adjustment_amount := p_actual_amount - v_source_amount;

  -- 実績額が元データと同額（差分 0）になった場合は、既存の調整があれば削除する
  IF v_adjustment_amount = 0 THEN
    DELETE FROM public.profit_loss_adjustments
    WHERE target_month = p_target_month
      AND business_id IS NOT DISTINCT FROM p_business_id
      AND cost_id IS NOT DISTINCT FROM p_cost_id
      AND recurring_cost_id IS NOT DISTINCT FROM p_recurring_cost_id;
    RETURN QUERY SELECT true, v_source_amount, 0::numeric;
    RETURN;
  END IF;

  -- 理由は必須（アプリ側でも必須入力にしているが、直接の RPC 呼び出しに備えて
  -- ここでも検証する。エラーメッセージは呼び出し側で判別できるよう固定文言にする）
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

COMMENT ON FUNCTION public.save_profit_loss_adjustment(bigint, bigint, bigint, date, numeric, text) IS
  '実績額修正の原子的な保存。対象行を FOR UPDATE でロックし、元データ金額の取得・差分計算・upsert（0 差分なら削除）を単一トランザクションで行う。adjusted_by は auth.uid() から解決し、クライアントからは受け取らない。書き込みの可否は呼び出し元ロールに対する profit_loss_adjustments の RLS がそのまま適用される（SECURITY INVOKER）。詳細: docs/database.md 5.12';

REVOKE EXECUTE ON FUNCTION public.save_profit_loss_adjustment(bigint, bigint, bigint, date, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_profit_loss_adjustment(bigint, bigint, bigint, date, numeric, text) TO authenticated;

-- ===== GRANT =====
-- migration 17 の方針に従い、テーブル権限を明示的に付与する（制限的な DEFAULT
-- PRIVILEGES を持つ環境で PostgREST が RLS を評価する前に 403 を返すのを防ぐ）。
-- 実効的なアクセス制御は上記 RLS が担う。
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profit_loss_adjustments
  TO authenticated, service_role;

-- anon（未ログイン）はアクセスしないため権限を剥奪する（budget_declarations と同方針）
REVOKE ALL ON TABLE profit_loss_adjustments FROM anon;
