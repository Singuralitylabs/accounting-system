-- budget_declaration_items.manager_id: 明細（収入・支出）ごとの担当者
--
-- 経理からの要望「収入・支出ごとに担当するメンバーが異なるため、明細単位で
-- 担当者を記録したい」に対応する。ヘッダの declared_by（申告者・最終更新者）とは
-- 別軸で、任意入力（NULL 許容）。詳細設計: docs/database.md 3.10, Issue #112

ALTER TABLE budget_declaration_items
  ADD COLUMN manager_id bigint REFERENCES profiles (id);

COMMENT ON COLUMN budget_declaration_items.manager_id IS
  '明細（収入・支出）ごとの担当者。メンバー（profiles）から任意選択、NULL 許容。extra_entries.manager_id と同じく参照アクションを指定しない（NO ACTION）ため、担当者に設定されたメンバーの profiles を削除しようとすると FK エラーになる（先に別メンバーへ付け替えるか、明細側の担当者を解除する必要がある）。既存明細は NULL のまま（バックフィルしない）';

-- FK 側の索引（extra_entries.manager_id / budget_declarations.declared_by と同じ方針）
CREATE INDEX IF NOT EXISTS idx_budget_declaration_items_manager_id
  ON budget_declaration_items (manager_id);

-- 明細担当者の選択肢（全メンバー）を返す関数。
--
-- profiles の SELECT RLS（migration 12）は teamleader を自チーム + 自分自身に
-- 制限するが、事前収支申告は teamleader もアクセスでき（ROUTE_PERMISSIONS）、
-- Issue #112 の受け入れ基準は「選択肢は全メンバー（チーム所属で絞らない）」。
-- migration 12 の auth_user_class() / auth_user_team() と同じ SECURITY DEFINER
-- パターンで RLS をバイパスするが、返すのは id / name のみとし、email / slack_id /
-- class / team 等の migration 12 が保護対象とする機微情報は含めない。
--
-- 呼び出し可能ロールは budget_declarations の許可ロール（ROUTE_PERMISSIONS の
-- /budget-declarations と同じ teamleader / accounting / admin）に絞る。
-- GRANT EXECUTE ... TO authenticated だけでは関数内にロール判定が無く、
-- public クラスのユーザーも自分のセッションから直接 RPC 呼び出しできてしまい、
-- migration 12 がまさに防いだ「public を含む全ログインユーザーが他人の情報を
-- 読める」を id/name について再び開けてしまう（PostgREST の RPC エンドポイントは
-- テーブルの RLS ポリシーとは独立に公開されるため、アプリ側のルートガードでは
-- 防げない）。
CREATE OR REPLACE FUNCTION public.get_member_options()
RETURNS TABLE(id bigint, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profiles.id, profiles.name FROM public.profiles
  WHERE public.auth_user_class() IN ('teamleader', 'accounting', 'admin')
  ORDER BY profiles.id
$$;

COMMENT ON FUNCTION public.get_member_options() IS
  '事前収支申告の明細担当者選択肢（全メンバーの id/name のみ）。profiles の SELECT RLS（teamleader は自チームのみ）をバイパスするが、機微情報は返さない。呼び出し可能ロールは teamleader/accounting/admin（/budget-declarations の許可ロールと同じ）に限定し、public から呼ばれた場合は 0 行を返す。詳細: docs/database.md';

REVOKE EXECUTE ON FUNCTION public.get_member_options() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_options() TO authenticated;

-- 保存時に manager_id が実在する profiles.id か確認するための関数。
--
-- 明細差し替え（saveBudgetDeclaration）は非トランザクション（既存明細を全 DELETE →
-- INSERT）のため、フォーム表示後に担当者の profiles が削除される等で存在しない
-- manager_id が渡されると、DELETE 成功後の INSERT が FK 違反（23503）で失敗し、
-- 既存明細が消えたまま partialWriteFailed になる。DELETE の前にここで弾く。
--
-- get_member_options() を流用して全メンバーを取得し JS 側で照合することもできるが、
-- 保存のたびに全メンバー分の行を転送するのは無駄（メンバー数が増えるほど悪化する）。
-- 渡された id 集合だけを DB 側で照合し、実在する id のみを返す。
CREATE OR REPLACE FUNCTION public.validate_member_ids(target_ids bigint[])
RETURNS TABLE(id bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profiles.id FROM public.profiles
  WHERE public.auth_user_class() IN ('teamleader', 'accounting', 'admin')
    AND profiles.id = ANY(target_ids)
$$;

COMMENT ON FUNCTION public.validate_member_ids(bigint[]) IS
  '渡された id のうち、実在する profiles.id のみを返す（事前収支申告の manager_id 保存前検証用）。get_member_options() と同じくロールを teamleader/accounting/admin に限定する。詳細: docs/database.md';

REVOKE EXECUTE ON FUNCTION public.validate_member_ids(bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_member_ids(bigint[]) TO authenticated;
