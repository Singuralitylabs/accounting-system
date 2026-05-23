-- 選択肢の種類
INSERT INTO select_option_types (name, display_name, category, display_order) VALUES
  ('team',        'チーム',   'basic_info', 1),
  ('category',    '分類',     'basic_info', 2),
  ('item',        '品目',     'cost_info',  1),
  ('certificate', '通知方法', 'cost_info',  2)
ON CONFLICT (name) DO NOTHING;

-- チーム
INSERT INTO select_options (type_id, value, display_order) VALUES
  ((SELECT id FROM select_option_types WHERE name = 'team'), 'シンラボ',     1),
  ((SELECT id FROM select_option_types WHERE name = 'team'), 'SDGs',         2),
  ((SELECT id FROM select_option_types WHERE name = 'team'), '広報',         3),
  ((SELECT id FROM select_option_types WHERE name = 'team'), 'AI事業創出',   4),
  ((SELECT id FROM select_option_types WHERE name = 'team'), 'ハロスク',     5),
  ((SELECT id FROM select_option_types WHERE name = 'team'), '事務局',       6)
ON CONFLICT (type_id, value) DO NOTHING;

-- 案件分類
INSERT INTO select_options (type_id, value, display_order) VALUES
  ((SELECT id FROM select_option_types WHERE name = 'category'), '会員費',         1),
  ((SELECT id FROM select_option_types WHERE name = 'category'), '受託案件',       2),
  ((SELECT id FROM select_option_types WHERE name = 'category'), '認定ファシリ',   3),
  ((SELECT id FROM select_option_types WHERE name = 'category'), '研修・検定',     4),
  ((SELECT id FROM select_option_types WHERE name = 'category'), 'ボードゲーム',   5),
  ((SELECT id FROM select_option_types WHERE name = 'category'), 'イベント',       6),
  ((SELECT id FROM select_option_types WHERE name = 'category'), 'ハロスク',       7),
  ((SELECT id FROM select_option_types WHERE name = 'category'), 'その他',         8)
ON CONFLICT (type_id, value) DO NOTHING;

-- 費目
INSERT INTO select_options (type_id, value, display_order) VALUES
  ((SELECT id FROM select_option_types WHERE name = 'item'), 'システム料',         1),
  ((SELECT id FROM select_option_types WHERE name = 'item'), '施設利用料',         2),
  ((SELECT id FROM select_option_types WHERE name = 'item'), '外注費',             3),
  ((SELECT id FROM select_option_types WHERE name = 'item'), '備品購入',           4),
  ((SELECT id FROM select_option_types WHERE name = 'item'), 'メンバー報酬',       5),
  ((SELECT id FROM select_option_types WHERE name = 'item'), 'シンラボ活動費',     6),
  ((SELECT id FROM select_option_types WHERE name = 'item'), '広告宣伝費',         7),
  ((SELECT id FROM select_option_types WHERE name = 'item'), '教育・研修',         8),
  ((SELECT id FROM select_option_types WHERE name = 'item'), '営業費',             9),
  ((SELECT id FROM select_option_types WHERE name = 'item'), 'その他',            10)
ON CONFLICT (type_id, value) DO NOTHING;

-- 通知方法
INSERT INTO select_options (type_id, value, display_order) VALUES
  ((SELECT id FROM select_option_types WHERE name = 'certificate'), '請求書', 1),
  ((SELECT id FROM select_option_types WHERE name = 'certificate'), '領収書', 2)
ON CONFLICT (type_id, value) DO NOTHING;
