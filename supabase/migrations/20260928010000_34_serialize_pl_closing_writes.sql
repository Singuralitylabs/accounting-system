-- 月次収支の確定と、同じ月への損益調整・経理追加収支の書き込みを直列化する（Issue #171）
--
-- 確定済みの月の編集ロック（migration 27）は RLS の private.is_pl_month_closed で判定しているが、
-- RLS は書き込みの文のスナップショットで評価されるため、READ COMMITTED では次の順序で
-- 書き込みが確定値から漏れる:
--   1. 経理担当 A が当月の損益調整・経理追加収支を書き込む（RLS の評価時点では未確定なので通る。
--      まだコミットしていない）
--   2. 経理担当 B の確定（save_profit_loss_closing）がコミットされ、直後の再集計
--      （app/utils/supabase/profitLossClosings.ts の verified）も A の書き込みを見ずに終わる
--   3. A の書き込みがコミットされる → 確定値に含まれないまま、以後その月はロックされる
--      （経理追加収支・管理費の損益調整は確定後の変更検知の対象外で、誰も気付けない）
--
-- 対策: 月単位の advisory lock（トランザクション終了まで保持）で確定と書き込みを直列化する。
--   - 確定（save_profit_loss_closing）: 対象月の排他ロックを取ってから確定ヘッダ・明細を書く
--   - 書き込み（profit_loss_adjustments / extra_entries の行トリガー）: 書き込んだ行の月
--     （UPDATE は変更前と変更後の両方）の共有ロックを取り、取得後に確定済みかを判定し直して、
--     確定済みなら MONTH_CLOSED（SQLSTATE 42501）で拒否する
-- これにより、書き込みは次のどちらかになる:
--   - 確定より先にロックを取った書き込み: 確定はその書き込みのコミット（またはロールバック）まで
--     待つため、確定のコミット後の再集計に必ず含まれる（違いがあれば確定値を取り直す）
--   - 確定が先にロックを取った場合: 書き込みは確定のコミットまで待ち、ロック取得後の判定で
--     確定済みとして拒否される（トランザクションごとロールバック）
-- 書き込み側はトリガーで行うため、RPC（save_extra_entries / save_profit_loss_adjustment）に加え、
-- PostgREST からの直接の INSERT / UPDATE / DELETE（前月コピー・損益調整の削除など）も対象になる。
--
-- ロック取得後の判定が確定のコミットを見られるのは、READ COMMITTED で VOLATILE な plpgsql 関数が
-- 文（式）ごとに新しいスナップショットを取るため（ロックの取得と判定を別の文にしている）。
-- PostgREST のトランザクションは READ COMMITTED（既定）であることを前提にする。
--
-- デッドロック: 書き込み側は共有ロックのため書き込み同士は競合せず、複数の月にまたがる書き込み
-- （一括保存・日付の変更）がどの順でロックを取っても互いを待たない。確定側は 1 つの月の排他ロック
-- しか取らず、取得後に書き込み側が持ちうるロック（行ロック・他の月のロック）を待たないため、
-- 確定と書き込みの間でも待ちの循環は生じない。
--
-- 対象外（同じ仕組みで塞がない理由）:
--   - business / costs / matters: 確定済みの月でも編集できる（編集ロックなし）。確定後の変更は
--     確定明細とライブ集計の差分検知（Issue #149）で検出され、反映・見送りを選べる
--   - recurring_costs: 定期費用マスタは確定済みの月があっても編集できる設計（migration 27）。
--     確定済みの月の表示は確定明細から行い、確定後の定期費用の変更は確定値に影響させない。
--     確定の前後にまたがった変更も、確定後の変更と同じ扱いになる（ロックで拒否されるわけでは
--     ないため「漏れたままロックされる」ことにはならない）
--   - RLS が適用されないロール（service_role・テーブル所有者）と、案件の明細・定期費用の削除に
--     伴う損益調整の CASCADE 削除（参照整合性のアクションはテーブル所有者の権限で実行される）:
--     もともと確定済みの月の編集ロックの対象外のため、トリガーでも何もしない
--
-- 詳細設計: docs/database.md 5.14 / 6.4, Issue #171

-- ===== 月単位の advisory lock =====
-- 第 1 キーは本機能の名前空間（Issue #148 の月次収支確定にちなむ固定値。advisory lock を
-- 別の用途で使う場合は別の値にする）、第 2 キーは月（YYYYMM）。
-- p_exclusive = true は確定用の排他ロック、false は書き込み用の共有ロック。
-- ロックはトランザクションの終了（コミット / ロールバック）まで保持される。
-- NULL（日付未入力の経理追加収支）は確定の対象外のため何もしない。
-- pg_advisory_* の EXECUTE 権限の有無に左右されないよう SECURITY DEFINER にする。
CREATE OR REPLACE FUNCTION private.lock_pl_month(p_month date, p_exclusive boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key integer;
BEGIN
  IF p_month IS NULL THEN
    RETURN;
  END IF;
  v_key := extract(year FROM p_month)::integer * 100 + extract(month FROM p_month)::integer;
  IF p_exclusive THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(148, v_key);
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(148, v_key);
  END IF;
END;
$$;

COMMENT ON FUNCTION private.lock_pl_month(date, boolean) IS
  '損益計算書の月次収支確定と、同じ月への損益調整・経理追加収支の書き込みを直列化する月単位の advisory lock（Issue #171）。p_exclusive = true は確定用の排他ロック、false は書き込み用の共有ロック。トランザクション終了まで保持。詳細: docs/database.md 5.14';

REVOKE EXECUTE ON FUNCTION private.lock_pl_month(date, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.lock_pl_month(date, boolean) TO authenticated;

-- ===== 書き込み側: 月の共有ロック + ロック取得後の確定済み判定 =====
-- profit_loss_adjustments（target_month）・extra_entries（entry_date）の BEFORE 行トリガー。
-- TG_ARGV[0] に月を表す列名を渡す。
-- SECURITY INVOKER（既定）にし、row_security_active で RLS が適用される利用者
-- （authenticated）の書き込みだけを対象にする（RLS をバイパスするロールは従来どおり編集ロックの
-- 対象外）。案件の明細・定期費用の削除に伴う CASCADE 削除は、参照整合性のアクションが
-- テーブル所有者の権限で実行され、その中で発火する BEFORE トリガーでは row_security_active が
-- false になるため対象外になる（AFTER トリガーは元の文の終わりに利用者の権限で発火するため
-- CASCADE を区別できない。BEFORE にしているのはこのため）。
-- UPDATE / DELETE は RLS の USING で対象外になった行（文の開始時点で確定済みの月の行）には
-- 発火しないため、従来どおり 0 行の更新・削除になる。INSERT と、UPDATE の変更後の月は
-- RLS の WITH CHECK より先にこのトリガーが判定するため、確定済みの月への書き込みは
-- RLS 違反ではなく MONTH_CLOSED（どちらも SQLSTATE 42501）で拒否される。
CREATE OR REPLACE FUNCTION private.guard_pl_closed_month_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_months date[] := '{}';
  v_month date;
BEGIN
  IF NOT pg_catalog.row_security_active(TG_RELID) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_months := v_months || (pg_catalog.to_jsonb(OLD) ->> TG_ARGV[0])::date;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_months := v_months || (pg_catalog.to_jsonb(NEW) ->> TG_ARGV[0])::date;
  END IF;
  SELECT coalesce(array_agg(DISTINCT pg_catalog.date_trunc('month', m)::date), '{}')
    INTO v_months
  FROM unnest(v_months) AS m
  WHERE m IS NOT NULL;

  FOREACH v_month IN ARRAY v_months LOOP
    PERFORM private.lock_pl_month(v_month, false);
  END LOOP;

  -- ロックの取得とは別の文で判定する（新しいスナップショットで、ロック待ちの間に
  -- コミットされた確定を見る）
  FOREACH v_month IN ARRAY v_months LOOP
    IF private.is_pl_month_closed(v_month) THEN
      RAISE EXCEPTION 'MONTH_CLOSED'
        USING ERRCODE = '42501',
              DETAIL = pg_catalog.format('%s の月は確定済みのため変更できません（%s）',
                                         pg_catalog.to_char(v_month, 'YYYY-MM'), TG_TABLE_NAME);
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.guard_pl_closed_month_write() IS
  '損益調整・経理追加収支の書き込みトリガー（Issue #171）。RLS が適用される利用者の書き込みについて、書き込んだ行の月（UPDATE は変更前と変更後）の共有ロック（private.lock_pl_month）を取り、取得後に確定済みなら MONTH_CLOSED（SQLSTATE 42501）で拒否する。確定（save_profit_loss_closing）の排他ロックと直列化し、確定のコミットをまたいだ書き込みが確定値から漏れるのを防ぐ。詳細: docs/database.md 5.14';

REVOKE EXECUTE ON FUNCTION private.guard_pl_closed_month_write() FROM PUBLIC;

CREATE TRIGGER guard_pl_closed_month_profit_loss_adjustments
    BEFORE INSERT OR UPDATE OR DELETE ON profit_loss_adjustments
    FOR EACH ROW EXECUTE FUNCTION private.guard_pl_closed_month_write('target_month');

CREATE TRIGGER guard_pl_closed_month_extra_entries
    BEFORE INSERT OR UPDATE OR DELETE ON extra_entries
    FOR EACH ROW EXECUTE FUNCTION private.guard_pl_closed_month_write('entry_date');

-- ===== 確定側: 月の排他ロック =====
-- 本体は migration 28 と同じ。権限の判定の後、確定ヘッダ・明細を書く前に対象月の排他ロックを取る
-- （確定の取り直し p_closing_id 指定時も同じ。確定済みの月への書き込みは拒否されるため
-- 実質的に待つことはないが、経路を揃える）。
CREATE OR REPLACE FUNCTION public.save_profit_loss_closing(
  p_target_month date,
  p_lines jsonb,
  p_closing_id bigint DEFAULT NULL
)
RETURNS TABLE (id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_closing_id bigint;
  v_profile_id bigint;
  v_profile_name text;
BEGIN
  IF public.auth_user_class() IS NULL
     OR public.auth_user_class() NOT IN ('admin', 'accounting') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.name INTO v_profile_id, v_profile_name
  FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'プロフィールが見つかりません';
  END IF;

  -- 同じ月への損益調整・経理追加収支の書き込み（共有ロック）が終わるまで待ち、以後の書き込みを
  -- このトランザクションの終了まで待たせる（Issue #171）
  PERFORM private.lock_pl_month(p_target_month, true);

  IF p_closing_id IS NULL THEN
    INSERT INTO public.profit_loss_closings
      (target_month, closed_by, closed_by_name, closed_at,
       refreshed_by, refreshed_by_name, refreshed_at)
    VALUES (p_target_month, v_profile_id, v_profile_name, now(), NULL, NULL, NULL)
    ON CONFLICT (target_month) DO NOTHING
    RETURNING profit_loss_closings.id INTO v_closing_id;
    IF v_closing_id IS NULL THEN
      RAISE EXCEPTION 'ALREADY_CLOSED';
    END IF;
  ELSE
    UPDATE public.profit_loss_closings c SET
      closed_by = v_profile_id,
      closed_by_name = v_profile_name,
      closed_at = now(),
      refreshed_by = NULL,
      refreshed_by_name = NULL,
      refreshed_at = NULL
    WHERE c.id = p_closing_id
      AND c.target_month = p_target_month
      AND c.closed_by = v_profile_id
    RETURNING c.id INTO v_closing_id;
    IF v_closing_id IS NULL THEN
      RAISE EXCEPTION 'CLOSING_CHANGED';
    END IF;
  END IF;

  DELETE FROM public.profit_loss_closing_dismissals
  WHERE closing_id = v_closing_id;

  DELETE FROM public.profit_loss_closing_lines
  WHERE closing_id = v_closing_id;

  INSERT INTO public.profit_loss_closing_lines
    (closing_id, source_type, source_id, matter_id, matter_user_id, matter_title, name, category,
     item, team, entry_type, entry_date, payment_cycle, source_amount,
     adjustment_amount, actual_amount, adjustment_reason, billing_amount,
     expense_amount)
  SELECT
    v_closing_id, l.source_type, l.source_id, l.matter_id, l.matter_user_id, l.matter_title, l.name,
    l.category, l.item, l.team, l.entry_type, l.entry_date, l.payment_cycle,
    l.source_amount, l.adjustment_amount, l.actual_amount, l.adjustment_reason,
    l.billing_amount, l.expense_amount
  FROM jsonb_to_recordset(p_lines) AS l(
    source_type text, source_id bigint, matter_id bigint, matter_user_id bigint, matter_title text,
    name text, category text, item text, team text, entry_type text,
    entry_date date, payment_cycle text, source_amount numeric,
    adjustment_amount numeric, actual_amount numeric, adjustment_reason text,
    billing_amount numeric, expense_amount numeric
  );

  RETURN QUERY SELECT v_closing_id;
END;
$$;

COMMENT ON FUNCTION public.save_profit_loss_closing(date, jsonb, bigint) IS
  '損益計算書の月次収支確定（Issue #148）。ヘッダ（profit_loss_closings）の追加と明細（profit_loss_closing_lines）の全置換を単一トランザクションで行う。p_closing_id が NULL なら新規の確定のみ（確定済みの月は ALREADY_CLOSED）、指定時は確定直後の再検証で自分の確定を取り直す場合のみ（一致しなければ CLOSING_CHANGED）。closed_by は auth.uid() から解決する。対象月の排他ロック（private.lock_pl_month）を取り、同じ月への損益調整・経理追加収支の書き込みと直列化する（Issue #171）。SECURITY DEFINER で関数内で経理担当者・管理者かを判定する（テーブルへの直接の書き込み権限は付与しない）。詳細: docs/database.md 5.14';
