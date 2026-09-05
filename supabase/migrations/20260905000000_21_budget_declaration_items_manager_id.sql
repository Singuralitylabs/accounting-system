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
CREATE OR REPLACE FUNCTION public.get_member_options()
RETURNS TABLE(id bigint, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profiles.id, profiles.name FROM public.profiles ORDER BY profiles.id
$$;

COMMENT ON FUNCTION public.get_member_options() IS
  '事前収支申告の明細担当者選択肢（全メンバーの id/name のみ）。profiles の SELECT RLS（teamleader は自チームのみ）をバイパスするが、機微情報は返さない。詳細: docs/database.md';

REVOKE EXECUTE ON FUNCTION public.get_member_options() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_options() TO authenticated;
