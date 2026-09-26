-- budget_recurring_items.display_order の一回限りの振り直し（Issue #136）
--
-- アプリ側の保存処理は display_order をチームごとに 0 から採番し直すが、
-- 本番の既存行は旧方式の全チーム通し採番（A:0,1 / B:2,3 …）のまま残っている。
-- 振り直しなしにデプロイすると、最初の保存で全チーム・全行の display_order が
-- 書き換わり、排除しようとした「全チームまとめて UPDATE」（lost update の窓）が
-- そのまま一度発生する。これを防ぐため、適用時点で既存行をチーム別に振り直す。
-- 既存のチーム内順序は維持する（旧 display_order 順、同値は id 順）。
-- 一致している行には触れない（updated_at トリガーの無駄な発火を避ける）。
UPDATE budget_recurring_items b
SET display_order = r.rn - 1
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY team ORDER BY display_order, id) AS rn
  FROM budget_recurring_items
) r
WHERE b.id = r.id
  AND b.display_order IS DISTINCT FROM r.rn - 1;
