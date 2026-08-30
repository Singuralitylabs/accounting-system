-- budget_declarations / budget_declaration_items: 事前収支申告
--
-- 毎月チームリーダーが翌月のチーム収支（見込み収入・見込み支出）を明細付きで申告する
-- ための 2 テーブル。1 チーム × 1 対象月につきヘッダ 1 行 + 明細 N 行。
-- 合計金額はヘッダに非正規化せず、明細から集計する（明細数が小さいため）。
-- 詳細設計: docs/database.md 3.9 / 3.10 / 5.8 / 5.9

-- ===== 1. 申告ヘッダ =====
CREATE TABLE budget_declarations (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_month  date NOT NULL,
  team          text NOT NULL,
  declared_by   bigint NOT NULL REFERENCES profiles (id),
  comment       text,
  inserted_at   timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- 月初日で格納する。CHECK が無いと 2026-10-01 と 2026-10-05 が別行として
  -- 登録でき、UNIQUE (target_month, team) が「1 チーム × 1 対象月」を担保できない
  -- （recurring_costs.start_month はアプリ側の正規化のみに依存している）。
  CONSTRAINT budget_declarations_target_month_check
    CHECK (target_month = date_trunc('month', target_month)::date),
  CONSTRAINT budget_declarations_target_month_team_key UNIQUE (target_month, team)
);

COMMENT ON TABLE budget_declarations IS '事前収支申告のヘッダ。1 チーム × 1 対象月につき 1 行。target_month は月初日で格納（recurring_costs.start_month と同方式）。合計金額は budget_declaration_items から集計する';

-- target_month 単独のインデックスは張らない。UNIQUE (target_month, team) の
-- インデックスが target_month を先頭列に持つため、対象月での絞り込みはそちらが使える。
CREATE INDEX IF NOT EXISTS idx_budget_declarations_team        ON budget_declarations (team);
-- FK 側の索引（extra_entries.manager_id と同じ方針。無いと profiles 削除のたびに
-- 全件走査になり、Supabase の unindexed_foreign_keys リンタにも検出される）
CREATE INDEX IF NOT EXISTS idx_budget_declarations_declared_by ON budget_declarations (declared_by);

CREATE TRIGGER update_budget_declarations_updated_at
    BEFORE UPDATE ON budget_declarations
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ===== 2. 申告明細 =====
CREATE TABLE budget_declaration_items (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  declaration_id bigint NOT NULL REFERENCES budget_declarations (id) ON DELETE CASCADE,
  entry_type     text NOT NULL CHECK (entry_type IN ('income', 'expense')),
  category       text NOT NULL,
  description    text NOT NULL,
  amount         numeric(15,2) NOT NULL CHECK (amount > 0),
  display_order  integer NOT NULL DEFAULT 0,
  inserted_at    timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE budget_declaration_items IS '事前収支申告の明細。entry_type は income / expense（extra_entries と同じ値域）。amount は見込み金額（円・税別）で正の値のみ';

CREATE INDEX IF NOT EXISTS idx_budget_declaration_items_declaration_id ON budget_declaration_items (declaration_id);

CREATE TRIGGER update_budget_declaration_items_updated_at
    BEFORE UPDATE ON budget_declaration_items
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ===== 3. RLS =====
-- 経理担当者 / 管理者は全行、チームリーダーは自チームの行のみ読み書き可能。
-- public ロール（profiles.class = 'public'）はアクセス不可。
--
-- 判定述語はヘッダ・明細あわせて 10 箇所で使うため、ヘルパ関数に切り出す。
-- 逐語コピーだと将来ロール条件を変えたときに 1 箇所直し忘れ、特定の操作にだけ
-- 古いルールが残る（エラーにならない）RLS バグを踏みやすい。
--
-- 閲覧者自身の class / team は SECURITY DEFINER ヘルパ（migration 12）から取得する
-- （profiles の SELECT ポリシーに依存しないため、チームリーダーが自チーム外の
-- 申告者プロフィールを読めない場合でも判定がぶれない）。
CREATE OR REPLACE FUNCTION public.can_access_team_budget(target_team text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT public.auth_user_class() IN ('admin', 'accounting')
      OR (
        public.auth_user_class() = 'teamleader'
        AND public.auth_user_team() IS NOT NULL
        AND target_team = public.auth_user_team()
      )
$$;

COMMENT ON FUNCTION public.can_access_team_budget(text) IS
  '事前収支申告（budget_declarations / budget_declaration_items）の RLS 判定。経理・管理者は全チーム、チームリーダーは自チームのみ true。詳細: docs/database.md 5.8';

-- 不特定多数からの直接呼び出しを避け、認証済みロールのみに実行を許可する（migration 12 と同方針）
REVOKE EXECUTE ON FUNCTION public.can_access_team_budget(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_team_budget(text) TO authenticated;

-- 効率について: 判定は行の team に依存するため、migration 08 の (select auth.uid()) の
-- ように InitPlan 化（ステートメントあたり 1 回）はできず、行ごとに評価される。
-- 1 行あたり profiles への索引参照が数回走るが、本テーブルの行数は
-- 「チーム数 × 対象月数」程度で小さいため許容する。
-- （auth.uid() 自体は migration 12 のヘルパ内で (select auth.uid()) に包んであり、
--   Supabase の auth_rls_initplan リンタの対象にはならない）

ALTER TABLE budget_declarations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_declaration_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_declarations_select_policy" ON budget_declarations
  FOR SELECT TO authenticated
  USING (public.can_access_team_budget(budget_declarations.team));

-- INSERT では自チームであることに加え、チームリーダーには declared_by = 自分自身を
-- 強制する。profiles の参照は自分自身の行のみで足りるため、profiles の SELECT
-- ポリシー（自分の行は常に可）に阻まれない。
--
-- ただしこれは **INSERT 単体での詐称防止**にとどまる。UPDATE は team しか見ないため、
-- 自分名義で INSERT → 直後に UPDATE で declared_by を他人に付け替える 2 手順で
-- 迂回できる。RLS の WITH CHECK からは OLD 行を参照できず「declared_by は不変か
-- 自分自身」を表現できないため、厳密に守るには BEFORE UPDATE トリガーが必要になる。
--
-- UPDATE / DELETE に declared_by の制約を課さない理由:
--   - 明細（budget_declaration_items）の書き込みは親ヘッダの team だけで判定するため、
--     チームリーダーは declared_by に触れずに金額を全部書き換えられる。UPDATE だけを
--     縛っても「declared_by = 実際に最後に手を入れた人」は DB では保証できない。
--   - 一方で縛ると、既存行を読んでそのまま書き戻す一般的な更新パターン
--     （元の declared_by を送る）が 42501 になり、同一チームの別リーダーや経理が
--     作成した行を編集できなくなる。profiles 削除前に declared_by を付け替える
--     運用（3.9 参照）も塞がる。
-- したがって declared_by は「アプリが最終更新者で更新する表示・監査補助用の項目」と
-- 位置づけ、DB は素朴な他人名義 INSERT を弾くところまでを担保する。
CREATE POLICY "budget_declarations_insert_policy" ON budget_declarations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_team_budget(budget_declarations.team)
    AND (
      public.auth_user_class() IN ('admin', 'accounting')
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = budget_declarations.declared_by
        AND p.user_id = (select auth.uid())
      )
    )
  );

-- WITH CHECK でも team を制約し、チームリーダーによる他チームへの付け替えを防ぐ
CREATE POLICY "budget_declarations_update_policy" ON budget_declarations
  FOR UPDATE TO authenticated
  USING (public.can_access_team_budget(budget_declarations.team))
  WITH CHECK (public.can_access_team_budget(budget_declarations.team));

CREATE POLICY "budget_declarations_delete_policy" ON budget_declarations
  FOR DELETE TO authenticated
  USING (public.can_access_team_budget(budget_declarations.team));

-- 明細は親ヘッダへの EXISTS で同条件を適用する（costs → matters の JOIN パターンと同様）。
-- EXISTS 内のサブクエリには budget_declarations の SELECT ポリシーも重ねて適用されるが、
-- 条件が同一なので結果は変わらない。
--
-- 4 コマンドで条件が完全に同一なので FOR ALL 1 本にまとめる（USING が
-- SELECT / UPDATE / DELETE に、WITH CHECK が INSERT / UPDATE に適用される）。
-- recurring_costs / extra_entries がコマンド別に分けているのは SELECT と書き込みで
-- 条件が異なるためで、ここには当てはまらない。WITH CHECK により、他チームの申告への
-- 付け替え（declaration_id の書き換え）も防げる。
CREATE POLICY "budget_declaration_items_all_policy" ON budget_declaration_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM budget_declarations d
      WHERE d.id = budget_declaration_items.declaration_id
      AND public.can_access_team_budget(d.team)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM budget_declarations d
      WHERE d.id = budget_declaration_items.declaration_id
      AND public.can_access_team_budget(d.team)
    )
  );

-- ===== 4. GRANT =====
-- migration 17 の方針に従い、テーブル権限を明示的に付与する（制限的な DEFAULT
-- PRIVILEGES を持つ環境で PostgREST が RLS を評価する前に 403 を返すのを防ぐ）。
-- 実効的なアクセス制御は上記 RLS が担う。
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE budget_declarations
  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE budget_declaration_items
  TO authenticated, service_role;

-- anon（未ログイン）は事前収支申告に一切アクセスしないため権限を剥奪する。
-- migration 17 の ALTER DEFAULT PRIVILEGES により、新規テーブルには何もしなくても
-- anon にフル CRUD が付いてしまう。現状は anon 向けポリシーが無いので SELECT は
-- 0 行・書き込みは 42501 で拒否されるが、RLS が唯一のゲートである状態は残るため、
-- 将来 TO anon のポリシーを足したり調査目的で RLS を外したりした瞬間に
-- 未ログインからのフル CRUD が開く。権限側でも閉じておく。
REVOKE ALL ON TABLE budget_declarations      FROM anon;
REVOKE ALL ON TABLE budget_declaration_items FROM anon;
