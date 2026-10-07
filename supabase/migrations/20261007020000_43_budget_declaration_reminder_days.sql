-- budget_declaration_reminder_days: per-day Slack reminder message for the unsubmitted budget
-- declaration reminder. Replaces budget_declaration_reminder_settings.target_days (migration 20):
-- one row per target day (JST, 1-31) carrying that day's header message. No rows = reminders stop.
-- The settings table held only target_days, so it is dropped after the data is carried over.

CREATE TABLE budget_declaration_reminder_days (
  day        smallint NOT NULL PRIMARY KEY,
  message    text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT budget_declaration_reminder_days_day_range_check
    CHECK (1 <= day AND day <= 31),
  CONSTRAINT budget_declaration_reminder_days_message_check
    CHECK (length(message) > 0)
);

COMMENT ON TABLE budget_declaration_reminder_days IS '事前収支申告の未申告 Slack リマインドの対象日（day）と日ごとの文面（message）。行なし = リマインド停止。詳細: docs/database.md 3.11 / 5.10';
COMMENT ON COLUMN budget_declaration_reminder_days.message IS 'メッセージ 1 行目のテンプレート。プレースホルダ {month} {deadline}。未申告チーム一覧・期限・URL はアプリが後ろに付与する';

CREATE TRIGGER update_budget_declaration_reminder_days_updated_at
    BEFORE UPDATE ON budget_declaration_reminder_days
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Carry over existing target days with the current fixed message so behavior does not change.
INSERT INTO budget_declaration_reminder_days (day, message)
SELECT DISTINCT d, '【事前収支申告リマインド】{month}分の事前収支申告が未申告・未完了のチームがあります。'
FROM budget_declaration_reminder_settings s, unnest(s.target_days) AS d;

DROP TABLE budget_declaration_reminder_settings;

-- ===== RLS =====
-- admin / accounting only (same role split as the dropped settings table). The cron route reads
-- with the service role, which bypasses RLS.
ALTER TABLE budget_declaration_reminder_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_declaration_reminder_days_select_policy"
  ON budget_declaration_reminder_days
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'));

CREATE POLICY "budget_declaration_reminder_days_insert_policy"
  ON budget_declaration_reminder_days
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_user_class() IN ('admin', 'accounting'));

CREATE POLICY "budget_declaration_reminder_days_update_policy"
  ON budget_declaration_reminder_days
  FOR UPDATE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'))
  WITH CHECK (public.auth_user_class() IN ('admin', 'accounting'));

CREATE POLICY "budget_declaration_reminder_days_delete_policy"
  ON budget_declaration_reminder_days
  FOR DELETE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE budget_declaration_reminder_days TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE budget_declaration_reminder_days TO service_role;
REVOKE ALL ON TABLE budget_declaration_reminder_days FROM anon;

-- ===== replace_budget_declaration_reminder_days =====
-- Replaces all rows in one transaction (DELETE then INSERT). An empty array stops reminders.
-- RLS filters a DELETE by an unauthorized caller to 0 rows without error and an empty INSERT
-- never hits the policy, so the role is checked explicitly to avoid a silent no-op.
-- p_rows: [{"day": 15, "message": "..."}, ...]; duplicate days fail on the primary key (23505).
CREATE OR REPLACE FUNCTION public.replace_budget_declaration_reminder_days(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF public.auth_user_class() IS NULL OR public.auth_user_class() NOT IN ('admin', 'accounting') THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array' USING ERRCODE = '22023';
  END IF;

  -- Serialize concurrent replacements: under READ COMMITTED a second DELETE would not see rows the
  -- first transaction just inserted, leaving a union of both saves or a 23505.
  LOCK TABLE public.budget_declaration_reminder_days IN SHARE ROW EXCLUSIVE MODE;

  DELETE FROM public.budget_declaration_reminder_days WHERE true;

  INSERT INTO public.budget_declaration_reminder_days (day, message)
  SELECT r.day, r.message
  FROM jsonb_to_recordset(p_rows) AS r(day smallint, message text);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_budget_declaration_reminder_days(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_budget_declaration_reminder_days(jsonb) TO authenticated, service_role;
