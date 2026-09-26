-- 損益調整（profit_loss_adjustments）の対象月を案件開始日の月へ付け替える（Issue #146）
--
-- 損益計算書の計上基準を「売上 = 請求日（business.invoice_date）の月 / 案件費用 =
-- 支払い期限（costs.period）の月」から「売上・案件費用とも所属案件の案件開始日
-- （matters.start_date）の月」に変更した。基準は過去の月にも遡って適用するため、
-- 旧基準の計上月に付いていた調整は、そのままでは「対象行が当月に存在しません」
-- になってしまう。旧計上月に付いていた案件の売上・費用の調整だけを、新しい
-- 計上月（案件開始日の月）へ移す（データ移行のみ。スキーマ変更なし）。
--
-- 付け替えない（据え置く）もの:
--   - target_month が旧計上月と一致しない調整（旧基準でも既に「対象行が当月に
--     存在しません」だったもの。経理が個別に判断済み / 対応待ちのため触らない）
--   - 案件開始日が NULL の案件の調整（新基準では「月未確定」扱いで付け替え先の月が無い）
--   - 旧計上月の日付（invoice_date / period）が NULL の行の調整（旧基準で月未確定）
--   - 付け替え先の月に同じ対象行の調整が既にある場合（部分 UNIQUE
--     （business_id / cost_id, target_month）の衝突を避ける）
--   いずれも従来どおり「対象行が当月に存在しません」の警告に出るため、経理が手動で対応する。
-- 定期費用（recurring_cost_id）の調整は計上ルールを変えていないため対象外。
--
-- 実績額（= 元データ + adjustment_amount）は元データも調整額も変えないため移行前後で一致する。
-- 同じ対象行の調整は旧計上月に最大 1 件（部分 UNIQUE）なので、1 文の UPDATE 内で
-- 付け替え先どうしが衝突することはない。
--
-- 下書き案件の明細に付いた調整も付け替えるが、下書きは損益計算書の集計対象外のため
-- 経理申請されるまでは「対象行が当月に存在しません」の警告に出る（申請されれば解消する）。
--
-- matters (start_date) のインデックスは追加しない（損益計算書は案件開始日の範囲で
-- 取得するが、件数規模的に不要。docs/database.md 3.2 参照）。

UPDATE public.profit_loss_adjustments AS a
SET target_month = date_trunc('month', m.start_date)::date
FROM public.business AS b
JOIN public.matters AS m ON m.id = b.matter_id
WHERE a.business_id = b.id
  AND m.start_date IS NOT NULL
  AND b.invoice_date IS NOT NULL
  AND a.target_month = date_trunc('month', b.invoice_date)::date
  AND a.target_month <> date_trunc('month', m.start_date)::date
  AND NOT EXISTS (
    SELECT 1 FROM public.profit_loss_adjustments AS x
    WHERE x.business_id = a.business_id
      AND x.target_month = date_trunc('month', m.start_date)::date
  );

UPDATE public.profit_loss_adjustments AS a
SET target_month = date_trunc('month', m.start_date)::date
FROM public.costs AS c
JOIN public.matters AS m ON m.id = c.matter_id
WHERE a.cost_id = c.id
  AND m.start_date IS NOT NULL
  AND c.period IS NOT NULL
  AND a.target_month = date_trunc('month', c.period)::date
  AND a.target_month <> date_trunc('month', m.start_date)::date
  AND NOT EXISTS (
    SELECT 1 FROM public.profit_loss_adjustments AS x
    WHERE x.cost_id = a.cost_id
      AND x.target_month = date_trunc('month', m.start_date)::date
  );
