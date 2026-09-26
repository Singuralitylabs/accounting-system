-- save_profit_loss_adjustment: 差分 0 の DELETE で対象が無い場合は deleted = false を返す（Issue #139）
--
-- 差分 0（実績額 = 元データ）の経路は既存の調整があれば削除するが、対象が無い場合
-- （既存調整が無い行に元データと同額を入力した場合）も無条件に deleted = true を
-- 返していたため、呼び出し側が「実績額修正を削除しました」と誤表示していた。
-- DELETE の影響行数を GET DIAGNOSTICS で取得し、0 行なら deleted = false を返す
-- （呼び出し側は「変更なし」として扱う）。本体は migration 27 と同じ
-- （確定済みの月の MONTH_CLOSED 判定を含む）。

CREATE OR REPLACE FUNCTION public.save_profit_loss_adjustment(
  p_business_id bigint,
  p_cost_id bigint,
  p_recurring_cost_id bigint,
  p_target_month date,
  p_actual_amount numeric,
  p_reason text
)
RETURNS TABLE (deleted boolean, source_amount numeric, adjustment_amount numeric)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_source_amount numeric;
  v_actual_amount numeric;
  v_adjustment_amount numeric;
  v_adjusted_by bigint;
  v_deleted_count integer;
BEGIN
  IF num_nonnulls(p_business_id, p_cost_id, p_recurring_cost_id) <> 1 THEN
    RAISE EXCEPTION '調整対象の指定が不正です';
  END IF;

  IF private.is_pl_month_closed(p_target_month) THEN
    RAISE EXCEPTION 'MONTH_CLOSED';
  END IF;

  v_actual_amount := round(p_actual_amount, 2);

  SELECT p.id INTO v_adjusted_by FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_adjusted_by IS NULL THEN
    RAISE EXCEPTION 'プロフィールが見つかりません';
  END IF;

  IF p_business_id IS NOT NULL THEN
    SELECT COALESCE(b.amount, 0) INTO v_source_amount
    FROM public.business b WHERE b.id = p_business_id FOR UPDATE;
  ELSIF p_cost_id IS NOT NULL THEN
    SELECT c.price INTO v_source_amount
    FROM public.costs c WHERE c.id = p_cost_id FOR UPDATE;
  ELSE
    SELECT rc.price INTO v_source_amount
    FROM public.recurring_costs rc WHERE rc.id = p_recurring_cost_id FOR UPDATE;
  END IF;

  IF v_source_amount IS NULL THEN
    RAISE EXCEPTION '対象データが見つかりません';
  END IF;

  v_adjustment_amount := v_actual_amount - v_source_amount;

  -- 差分 0（実績額 = 元データ）なら既存の調整を削除する。対象が無ければ
  -- deleted = false を返し、呼び出し側が「変更なし」として扱えるようにする
  IF v_adjustment_amount = 0 THEN
    DELETE FROM public.profit_loss_adjustments
    WHERE target_month = p_target_month
      AND business_id IS NOT DISTINCT FROM p_business_id
      AND cost_id IS NOT DISTINCT FROM p_cost_id
      AND recurring_cost_id IS NOT DISTINCT FROM p_recurring_cost_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN QUERY SELECT (v_deleted_count > 0), v_source_amount, 0::numeric;
    RETURN;
  END IF;

  IF btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  IF p_business_id IS NOT NULL THEN
    INSERT INTO public.profit_loss_adjustments
      (target_month, business_id, adjustment_amount, source_amount_snapshot, reason, adjusted_by)
    VALUES (p_target_month, p_business_id, v_adjustment_amount, v_source_amount, btrim(p_reason), v_adjusted_by)
    ON CONFLICT (business_id, target_month) WHERE business_id IS NOT NULL
    DO UPDATE SET
      adjustment_amount = EXCLUDED.adjustment_amount,
      source_amount_snapshot = EXCLUDED.source_amount_snapshot,
      reason = EXCLUDED.reason,
      adjusted_by = EXCLUDED.adjusted_by;
  ELSIF p_cost_id IS NOT NULL THEN
    INSERT INTO public.profit_loss_adjustments
      (target_month, cost_id, adjustment_amount, source_amount_snapshot, reason, adjusted_by)
    VALUES (p_target_month, p_cost_id, v_adjustment_amount, v_source_amount, btrim(p_reason), v_adjusted_by)
    ON CONFLICT (cost_id, target_month) WHERE cost_id IS NOT NULL
    DO UPDATE SET
      adjustment_amount = EXCLUDED.adjustment_amount,
      source_amount_snapshot = EXCLUDED.source_amount_snapshot,
      reason = EXCLUDED.reason,
      adjusted_by = EXCLUDED.adjusted_by;
  ELSE
    INSERT INTO public.profit_loss_adjustments
      (target_month, recurring_cost_id, adjustment_amount, source_amount_snapshot, reason, adjusted_by)
    VALUES (p_target_month, p_recurring_cost_id, v_adjustment_amount, v_source_amount, btrim(p_reason), v_adjusted_by)
    ON CONFLICT (recurring_cost_id, target_month) WHERE recurring_cost_id IS NOT NULL
    DO UPDATE SET
      adjustment_amount = EXCLUDED.adjustment_amount,
      source_amount_snapshot = EXCLUDED.source_amount_snapshot,
      reason = EXCLUDED.reason,
      adjusted_by = EXCLUDED.adjusted_by;
  END IF;

  RETURN QUERY SELECT false, v_source_amount, v_adjustment_amount;
END;
$$;
