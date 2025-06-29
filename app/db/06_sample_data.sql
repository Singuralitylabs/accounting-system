-- サンプルデータ作成SQL
-- 実行前に必ずバックアップを取ってください

-- ========================================
-- 1. matters テーブルのサンプルデータ
-- ========================================

INSERT INTO matters (title, category, team, description, start_date, is_fixed, is_completed, user_id) VALUES
-- 案件1: 基本的な受託案件
('AIチャットボット開発プロジェクト', '受託案件', 'AI事業創出', 
 '企業向けのカスタマーサポート用AIチャットボットの開発・導入プロジェクト', 
 '2025-01-15', false, false, 1),

-- 案件2: 研修案件
('DX人材育成研修プログラム', '研修・検定', 'シンラボ', 
 '中小企業向けのデジタルトランスフォーメーション人材育成のための研修プログラム', 
 '2025-02-01', true, false, 1),

-- 案件3: イベント案件
('未来技術推進協会 年次総会', 'イベント', '事務局', 
 '2025年度の年次総会開催に関する企画・運営業務', 
 '2025-03-20', false, false, 1),

-- 案件4: SDGs関連
('持続可能な街づくりコンサルティング', '受託案件', 'SDGs', 
 '地方自治体向けのSDGs達成に向けた街づくりコンサルティング業務', 
 '2025-01-10', true, true, 1),

-- 案件5: ハロスク案件
('プログラミング教育カリキュラム開発', 'ハロスク', 'ハロスク', 
 '小中学生向けのプログラミング教育カリキュラムの開発と教材作成', 
 '2025-02-15', false, false, 1);

-- ========================================
-- 2. business テーブルのサンプルデータ
-- ========================================

-- 各案件に対応する売上情報を追加
-- matter_idは上で作成された案件のIDを使用

INSERT INTO business (name, invoice_date, period_date, amount, is_completed, matter_id) VALUES
-- 案件1の売上
('AIチャットボット開発 初期フェーズ', '2025-01-31', '2025-01-01', 1500000.00, true, 
 (SELECT id FROM matters WHERE title = 'AIチャットボット開発プロジェクト')),

('AIチャットボット開発 実装フェーズ', '2025-02-28', '2025-02-01', 2000000.00, false, 
 (SELECT id FROM matters WHERE title = 'AIチャットボット開発プロジェクト')),

-- 案件2の売上
('DX人材育成研修 第1期', '2025-02-15', '2025-02-01', 800000.00, true, 
 (SELECT id FROM matters WHERE title = 'DX人材育成研修プログラム')),

-- 案件3の売上
('年次総会 会場費・設営費', '2025-03-31', '2025-03-01', 500000.00, false, 
 (SELECT id FROM matters WHERE title = '未来技術推進協会 年次総会')),

-- 案件4の売上
('街づくりコンサルティング 完了報酬', '2025-01-25', '2025-01-01', 1200000.00, true, 
 (SELECT id FROM matters WHERE title = '持続可能な街づくりコンサルティング')),

-- 案件5の売上
('プログラミング教育カリキュラム 設計費', '2025-03-15', '2025-03-01', 600000.00, false, 
 (SELECT id FROM matters WHERE title = 'プログラミング教育カリキュラム開発'));

-- ========================================
-- 3. costs テーブルのサンプルデータ
-- ========================================

INSERT INTO costs (name, item, payment_target, price, period, certificate, withholding, is_completed, comment, matter_id) VALUES
-- 案件1のコスト
('外部エンジニア委託費', '外注費', '株式会社テックソリューション', 800000.00, '2025-01-31', '請求書', true, true, 
 'AIモデル開発の専門業務を外部委託', 
 (SELECT id FROM matters WHERE title = 'AIチャットボット開発プロジェクト')),

('クラウドサーバー利用料', 'システム料', 'AWS Japan', 150000.00, '2025-02-28', '請求書', false, false, 
 '開発・テスト環境のクラウドインフラ費用', 
 (SELECT id FROM matters WHERE title = 'AIチャットボット開発プロジェクト')),

-- 案件2のコスト
('研修講師謝礼', 'メンバー報酬', '田中太郎', 200000.00, '2025-02-15', '領収書', true, true, 
 'DX研修の外部講師への謝礼', 
 (SELECT id FROM matters WHERE title = 'DX人材育成研修プログラム')),

('研修会場レンタル料', '施設利用料', '東京ビジネスセンター', 80000.00, '2025-02-01', '請求書', false, true, 
 '研修会場の2日間レンタル費用', 
 (SELECT id FROM matters WHERE title = 'DX人材育成研修プログラム')),

-- 案件3のコスト
('総会会場設営費', '外注費', '株式会社イベントプロ', 300000.00, '2025-03-25', '請求書', false, false, 
 '年次総会会場の設営・音響・照明等', 
 (SELECT id FROM matters WHERE title = '未来技術推進協会 年次総会')),

-- 案件4のコスト
('現地調査交通費', 'その他', '山田慎也', 45000.00, '2025-01-20', '領収書', false, true, 
 'コンサルティング現地調査のための交通費・宿泊費', 
 (SELECT id FROM matters WHERE title = '持続可能な街づくりコンサルティング')),

-- 案件5のコスト
('教材制作ソフトウェア', '備品購入', 'Adobe Inc.', 120000.00, '2025-02-28', '請求書', false, false, 
 'カリキュラム教材制作用のデザインソフトウェア年間ライセンス', 
 (SELECT id FROM matters WHERE title = 'プログラミング教育カリキュラム開発'));

-- ========================================
-- データ確認用クエリ
-- ========================================

-- 作成されたデータの確認
-- SELECT 'matters テーブル' as table_name, COUNT(*) as record_count FROM matters
-- UNION ALL
-- SELECT 'business テーブル' as table_name, COUNT(*) as record_count FROM business  
-- UNION ALL
-- SELECT 'costs テーブル' as table_name, COUNT(*) as record_count FROM costs;

-- 案件ごとの売上・コスト集計
-- SELECT 
--     m.title,
--     COALESCE(SUM(b.amount), 0) as total_revenue,
--     COALESCE(SUM(c.price), 0) as total_cost,
--     COALESCE(SUM(b.amount), 0) - COALESCE(SUM(c.price), 0) as profit
-- FROM matters m
-- LEFT JOIN business b ON m.id = b.matter_id
-- LEFT JOIN costs c ON m.id = c.matter_id
-- GROUP BY m.id, m.title
-- ORDER BY m.title;