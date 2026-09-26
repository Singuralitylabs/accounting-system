-- profit_loss_labels: 損益計算書上の表示タイトル（案件・明細の名称の上書き）
--
-- 経理からの要望「損益計算書上の各収入・支出のタイトルを経理が変更できるようにする」
-- （Issue #150）に対応する。案件名（matters.title）・取引先名（business.name）・
-- コスト名（costs.name）・定期費用名（recurring_costs.name）の元データは書き換えず、
-- 損益計算書上だけで有効な表示タイトルを本テーブルに保持する。
-- 元データを直接書き換えない理由は損益調整（migration 23）と同じ:
--   - matters / business / costs は案件ライフサイクル・差し戻し検知の対象で、経理が
--     直接書き換えると担当者の見ている案件が変わり、差し戻し検知（has_updates）が誤発火する
-- タイトルは対象行単位で全月共通（月ごとに別のタイトルは持たない）。金額・集計に影響
-- しないため、月次収支確定（Issue #148）の編集ロック・変更検知（Issue #149）の対象外。
-- 詳細設計: docs/database.md 3.14 / 5.13, Issue #150

CREATE TABLE profit_loss_labels (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  matter_id         bigint REFERENCES matters (id) ON DELETE CASCADE,
  business_id       bigint REFERENCES business (id) ON DELETE CASCADE,
  cost_id           bigint REFERENCES costs (id) ON DELETE CASCADE,
  recurring_cost_id bigint REFERENCES recurring_costs (id) ON DELETE CASCADE,
  label             text NOT NULL,
  updated_by        bigint NOT NULL REFERENCES profiles (id),
  inserted_at       timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- 対象は必ずちょうど1つ（profit_loss_adjustments と同じ理由で実 FK を4本張る）
  CONSTRAINT profit_loss_labels_exactly_one_target_check
    CHECK (num_nonnulls(matter_id, business_id, cost_id, recurring_cost_id) = 1),
  -- 空（空白のみ）のタイトルは保存させない（空欄で保存した場合はアプリ側で行ごと削除し、
  -- 元の名称に戻す）。前後の空白もアプリ側で除去してから保存する
  CONSTRAINT profit_loss_labels_label_check
    CHECK (btrim(label) <> '' AND label = btrim(label) AND char_length(label) <= 200)
);

COMMENT ON TABLE profit_loss_labels IS '損益計算書上の表示タイトル（Issue #150）。案件（matters）・売上明細（business）・費用明細（costs）・定期費用（recurring_costs）のいずれか1つに対し、損益計算書でのみ使う名称を保持する（全月共通）。元データの名称は変更しない。対象行が削除されると CASCADE で削除される';

-- 対象ごとの部分 UNIQUE インデックス（対象行 1 件につきタイトルは 1 件。
-- 先頭列が FK 列のため、対象行削除時の CASCADE 検索・FK 側の索引を兼ねる）
CREATE UNIQUE INDEX profit_loss_labels_matter_id_key
  ON profit_loss_labels (matter_id) WHERE matter_id IS NOT NULL;
CREATE UNIQUE INDEX profit_loss_labels_business_id_key
  ON profit_loss_labels (business_id) WHERE business_id IS NOT NULL;
CREATE UNIQUE INDEX profit_loss_labels_cost_id_key
  ON profit_loss_labels (cost_id) WHERE cost_id IS NOT NULL;
CREATE UNIQUE INDEX profit_loss_labels_recurring_cost_id_key
  ON profit_loss_labels (recurring_cost_id) WHERE recurring_cost_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profit_loss_labels_updated_by
  ON profit_loss_labels (updated_by);

CREATE TRIGGER update_profit_loss_labels_updated_at
    BEFORE UPDATE ON profit_loss_labels
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ===== RLS =====
-- SELECT は損益計算書の閲覧ロール。経理担当者・管理者は全行、チームリーダーは対象の
-- チーム（案件 / 明細は matters.team、定期費用は recurring_costs.team）が自チーム、
-- または全体共通（recurring_costs.team IS NULL）の行のみ（profit_loss_adjustments と同じ方針）。
-- 書き込みは経理担当者・管理者のみ。
--
-- 対象のチームの解決は private.pl_adjustment_team（migration 23）と同じ理由で
-- SECURITY DEFINER の private 関数にする（matters の RLS に委ねると他チームの対象が
-- NULL = 全体共通に見えて表示を誤って許可してしまう。public に置くと RPC として直接
-- 呼び出せて他チームの情報が漏れる）。
CREATE OR REPLACE FUNCTION private.pl_label_team(
  p_matter_id bigint,
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
    WHEN p_matter_id IS NOT NULL THEN (
      SELECT matters.team FROM public.matters WHERE matters.id = p_matter_id
    )
    ELSE private.pl_adjustment_team(p_business_id, p_cost_id, p_recurring_cost_id)
  END
$$;

COMMENT ON FUNCTION private.pl_label_team(bigint, bigint, bigint, bigint) IS
  '損益計算書の表示タイトル（profit_loss_labels）の対象が属するチームを返す。案件は matters.team、明細・定期費用は private.pl_adjustment_team と同じ。matters 等の RLS に依存しないよう SECURITY DEFINER にし、PostgREST に公開しない private スキーマに置く。詳細: docs/database.md 5.13';

-- 対象（案件 / 売上明細 / 費用明細）の案件の作成者（matters.user_id）。定期費用は NULL。
-- ライブ集計では matters / business / costs の RLS によりチームリーダーは自分が作成した
-- 他チームの案件も見えるため、その案件の上書きタイトルも見せる（表示を経理と揃える）
CREATE OR REPLACE FUNCTION private.pl_label_matter_user(
  p_matter_id bigint,
  p_business_id bigint,
  p_cost_id bigint
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_matter_id IS NOT NULL THEN (
      SELECT matters.user_id FROM public.matters WHERE matters.id = p_matter_id
    )
    WHEN p_business_id IS NOT NULL THEN (
      SELECT matters.user_id FROM public.business
      JOIN public.matters ON matters.id = business.matter_id
      WHERE business.id = p_business_id
    )
    WHEN p_cost_id IS NOT NULL THEN (
      SELECT matters.user_id FROM public.costs
      JOIN public.matters ON matters.id = costs.matter_id
      WHERE costs.id = p_cost_id
    )
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION private.pl_label_matter_user(bigint, bigint, bigint) IS
  '損益計算書の表示タイトルの対象の案件の作成者（matters.user_id）を返す（定期費用は NULL）。pl_label_team と同じ理由で SECURITY DEFINER・private スキーマ。詳細: docs/database.md 5.13';

CREATE OR REPLACE FUNCTION private.can_view_pl_label(
  p_matter_id bigint,
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
          private.pl_label_team(p_matter_id, p_business_id, p_cost_id, p_recurring_cost_id) IS NULL
          OR private.pl_label_team(p_matter_id, p_business_id, p_cost_id, p_recurring_cost_id) = public.auth_user_team()
        )
      )
      OR (
        public.auth_user_class() = 'teamleader'
        AND private.pl_label_matter_user(p_matter_id, p_business_id, p_cost_id) = (
          SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
        )
      )
$$;

COMMENT ON FUNCTION private.can_view_pl_label(bigint, bigint, bigint, bigint) IS
  '損益計算書の表示タイトル（profit_loss_labels）の SELECT 判定。経理・管理者は全行、チームリーダーは自チームの対象 + 全体共通（recurring_costs.team IS NULL）の対象 + 自分が作成した案件の対象のみ true。詳細: docs/database.md 5.13';

REVOKE EXECUTE ON FUNCTION private.pl_label_team(bigint, bigint, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.pl_label_team(bigint, bigint, bigint, bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION private.pl_label_matter_user(bigint, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.pl_label_matter_user(bigint, bigint, bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION private.can_view_pl_label(bigint, bigint, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_view_pl_label(bigint, bigint, bigint, bigint) TO authenticated;

ALTER TABLE profit_loss_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profit_loss_labels_select_policy" ON profit_loss_labels
  FOR SELECT TO authenticated
  USING (
    private.can_view_pl_label(matter_id, business_id, cost_id, recurring_cost_id)
  );

-- updated_by は PostgREST 経由では任意の profiles.id を指定できるため、呼び出し本人の
-- profiles.id と一致することを WITH CHECK で要求する（profit_loss_adjustments と同じ）
CREATE POLICY "profit_loss_labels_insert_policy" ON profit_loss_labels
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_user_class() IN ('admin', 'accounting')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profit_loss_labels.updated_by
      AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "profit_loss_labels_update_policy" ON profit_loss_labels
  FOR UPDATE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'))
  WITH CHECK (
    public.auth_user_class() IN ('admin', 'accounting')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profit_loss_labels.updated_by
      AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "profit_loss_labels_delete_policy" ON profit_loss_labels
  FOR DELETE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'));

-- ===== 表示タイトルの保存（空欄は削除） =====
-- 部分 UNIQUE インデックスは PostgREST の upsert（on_conflict）では推論できないため、
-- INSERT ... ON CONFLICT (列) WHERE 列 IS NOT NULL を関数内で行う
-- （save_profit_loss_adjustment と同じ方式）。SECURITY INVOKER のため、書き込みの可否は
-- 呼び出し元ロールに対する上記 RLS がそのまま適用される。updated_by は auth.uid() から
-- 解決し、クライアントからは受け取らない。
-- p_label は前後の空白を除去し、空になった場合は既存のタイトルを削除する（元の名称に戻す）。
CREATE OR REPLACE FUNCTION public.save_profit_loss_label(
  p_label text,
  p_matter_id bigint DEFAULT NULL,
  p_business_id bigint DEFAULT NULL,
  p_cost_id bigint DEFAULT NULL,
  p_recurring_cost_id bigint DEFAULT NULL
)
RETURNS TABLE (deleted boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_label text;
  v_updated_by bigint;
BEGIN
  IF num_nonnulls(p_matter_id, p_business_id, p_cost_id, p_recurring_cost_id) <> 1 THEN
    RAISE EXCEPTION 'タイトルの対象の指定が不正です';
  END IF;

  SELECT p.id INTO v_updated_by FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_updated_by IS NULL THEN
    RAISE EXCEPTION 'プロフィールが見つかりません';
  END IF;

  v_label := btrim(coalesce(p_label, ''));

  IF v_label = '' THEN
    DELETE FROM public.profit_loss_labels
    WHERE matter_id IS NOT DISTINCT FROM p_matter_id
      AND business_id IS NOT DISTINCT FROM p_business_id
      AND cost_id IS NOT DISTINCT FROM p_cost_id
      AND recurring_cost_id IS NOT DISTINCT FROM p_recurring_cost_id;
    RETURN QUERY SELECT true;
    RETURN;
  END IF;

  IF char_length(v_label) > 200 THEN
    RAISE EXCEPTION 'LABEL_TOO_LONG';
  END IF;

  IF p_matter_id IS NOT NULL THEN
    INSERT INTO public.profit_loss_labels (matter_id, label, updated_by)
    VALUES (p_matter_id, v_label, v_updated_by)
    ON CONFLICT (matter_id) WHERE matter_id IS NOT NULL
    DO UPDATE SET label = EXCLUDED.label, updated_by = EXCLUDED.updated_by;
  ELSIF p_business_id IS NOT NULL THEN
    INSERT INTO public.profit_loss_labels (business_id, label, updated_by)
    VALUES (p_business_id, v_label, v_updated_by)
    ON CONFLICT (business_id) WHERE business_id IS NOT NULL
    DO UPDATE SET label = EXCLUDED.label, updated_by = EXCLUDED.updated_by;
  ELSIF p_cost_id IS NOT NULL THEN
    INSERT INTO public.profit_loss_labels (cost_id, label, updated_by)
    VALUES (p_cost_id, v_label, v_updated_by)
    ON CONFLICT (cost_id) WHERE cost_id IS NOT NULL
    DO UPDATE SET label = EXCLUDED.label, updated_by = EXCLUDED.updated_by;
  ELSE
    INSERT INTO public.profit_loss_labels (recurring_cost_id, label, updated_by)
    VALUES (p_recurring_cost_id, v_label, v_updated_by)
    ON CONFLICT (recurring_cost_id) WHERE recurring_cost_id IS NOT NULL
    DO UPDATE SET label = EXCLUDED.label, updated_by = EXCLUDED.updated_by;
  END IF;

  RETURN QUERY SELECT false;
END;
$$;

COMMENT ON FUNCTION public.save_profit_loss_label(text, bigint, bigint, bigint, bigint) IS
  '損益計算書の表示タイトルの保存（Issue #150）。対象（案件 / 売上明細 / 費用明細 / 定期費用のいずれか1つ）のタイトルを upsert し、空欄（空白のみ）なら削除して元の名称に戻す。updated_by は auth.uid() から解決する。書き込みの可否は呼び出し元ロールに対する profit_loss_labels の RLS がそのまま適用される（SECURITY INVOKER）。詳細: docs/database.md 5.13';

REVOKE EXECUTE ON FUNCTION public.save_profit_loss_label(text, bigint, bigint, bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_profit_loss_label(text, bigint, bigint, bigint, bigint) TO authenticated;

-- ===== GRANT =====
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profit_loss_labels
  TO authenticated, service_role;
REVOKE ALL ON TABLE profit_loss_labels FROM anon;
