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
-- 閲覧者自身の class / team は SECURITY DEFINER ヘルパ（migration 12）から取得する
-- （profiles の SELECT ポリシーに依存しないため、チームリーダーが自チーム外の
-- 申告者プロフィールを読めない場合でも判定がぶれない）。
ALTER TABLE budget_declarations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_declaration_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_declarations_select_policy" ON budget_declarations
  FOR SELECT TO authenticated
  USING (
    public.auth_user_class() IN ('admin', 'accounting')
    OR (
      public.auth_user_class() = 'teamleader'
      AND public.auth_user_team() IS NOT NULL
      AND budget_declarations.team = public.auth_user_team()
    )
  );

-- 書き込み時は自チームであることに加え、チームリーダーには declared_by = 自分自身を
-- 強制する（申告者の詐称防止）。経理・管理者は代理入力があるため制約しない。
-- profiles の参照は自分自身の行のみで足りるため、profiles の SELECT ポリシー
-- （自分の行は常に可）に阻まれない。
--
-- declared_by は「最終更新した申告者」を表すため、UPDATE でもこの制約を課す。
-- 同じチームに複数のチームリーダーがいる場合、他のリーダーや経理が作成した行を
-- 編集するときも declared_by は更新者自身に付け替わる（これが意図した挙動）。
-- **アプリ側は UPDATE 時に必ず declared_by へ更新者自身の profiles.id を送ること。**
-- 送らずに部分更新すると、行は見えているのに 42501（RLS 違反）になり原因が分かりにくい。
-- なお DELETE には declared_by の制約を課さない（自チームの行はリーダーなら誰でも
-- 削除できてよく、削除後に残す更新者の記録も無いため）。
CREATE POLICY "budget_declarations_insert_policy" ON budget_declarations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_user_class() IN ('admin', 'accounting')
    OR (
      public.auth_user_class() = 'teamleader'
      AND public.auth_user_team() IS NOT NULL
      AND budget_declarations.team = public.auth_user_team()
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = budget_declarations.declared_by
        AND p.user_id = (select auth.uid())
      )
    )
  );

-- WITH CHECK でも team を制約し、チームリーダーによる他チームへの付け替えを防ぐ
CREATE POLICY "budget_declarations_update_policy" ON budget_declarations
  FOR UPDATE TO authenticated
  USING (
    public.auth_user_class() IN ('admin', 'accounting')
    OR (
      public.auth_user_class() = 'teamleader'
      AND public.auth_user_team() IS NOT NULL
      AND budget_declarations.team = public.auth_user_team()
    )
  )
  WITH CHECK (
    public.auth_user_class() IN ('admin', 'accounting')
    OR (
      public.auth_user_class() = 'teamleader'
      AND public.auth_user_team() IS NOT NULL
      AND budget_declarations.team = public.auth_user_team()
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = budget_declarations.declared_by
        AND p.user_id = (select auth.uid())
      )
    )
  );

CREATE POLICY "budget_declarations_delete_policy" ON budget_declarations
  FOR DELETE TO authenticated
  USING (
    public.auth_user_class() IN ('admin', 'accounting')
    OR (
      public.auth_user_class() = 'teamleader'
      AND public.auth_user_team() IS NOT NULL
      AND budget_declarations.team = public.auth_user_team()
    )
  );

-- 明細は親ヘッダへの EXISTS で同条件を適用する（costs → matters の JOIN パターンと同様）。
-- EXISTS 内のサブクエリには budget_declarations の SELECT ポリシーも重ねて適用されるが、
-- 条件が同一なので結果は変わらない。
CREATE POLICY "budget_declaration_items_select_policy" ON budget_declaration_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM budget_declarations d
      WHERE d.id = budget_declaration_items.declaration_id
      AND (
        public.auth_user_class() IN ('admin', 'accounting')
        OR (
          public.auth_user_class() = 'teamleader'
          AND public.auth_user_team() IS NOT NULL
          AND d.team = public.auth_user_team()
        )
      )
    )
  );

CREATE POLICY "budget_declaration_items_insert_policy" ON budget_declaration_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM budget_declarations d
      WHERE d.id = budget_declaration_items.declaration_id
      AND (
        public.auth_user_class() IN ('admin', 'accounting')
        OR (
          public.auth_user_class() = 'teamleader'
          AND public.auth_user_team() IS NOT NULL
          AND d.team = public.auth_user_team()
        )
      )
    )
  );

-- WITH CHECK でも親ヘッダを制約し、他チームの申告への付け替えを防ぐ
CREATE POLICY "budget_declaration_items_update_policy" ON budget_declaration_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM budget_declarations d
      WHERE d.id = budget_declaration_items.declaration_id
      AND (
        public.auth_user_class() IN ('admin', 'accounting')
        OR (
          public.auth_user_class() = 'teamleader'
          AND public.auth_user_team() IS NOT NULL
          AND d.team = public.auth_user_team()
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM budget_declarations d
      WHERE d.id = budget_declaration_items.declaration_id
      AND (
        public.auth_user_class() IN ('admin', 'accounting')
        OR (
          public.auth_user_class() = 'teamleader'
          AND public.auth_user_team() IS NOT NULL
          AND d.team = public.auth_user_team()
        )
      )
    )
  );

CREATE POLICY "budget_declaration_items_delete_policy" ON budget_declaration_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM budget_declarations d
      WHERE d.id = budget_declaration_items.declaration_id
      AND (
        public.auth_user_class() IN ('admin', 'accounting')
        OR (
          public.auth_user_class() = 'teamleader'
          AND public.auth_user_team() IS NOT NULL
          AND d.team = public.auth_user_team()
        )
      )
    )
  );

-- ===== 4. GRANT =====
-- migration 17 の方針に従い、テーブル権限を明示的に付与する（新しい Supabase イメージの
-- 制限的な DEFAULT PRIVILEGES で PostgREST が 403 を返すのを防ぐ保険。migration 17 の
-- ALTER DEFAULT PRIVILEGES でも同じ権限は付くが、既存テーブルと同じ状態を明示する）。
-- 実効的なアクセス制御は上記 RLS が担う（anon 向けポリシーが無いため、GRANT があっても
-- 未ログインからは 0 行になる）。
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE budget_declarations
  TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE budget_declaration_items
  TO anon, authenticated, service_role;
