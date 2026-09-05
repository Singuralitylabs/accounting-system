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
