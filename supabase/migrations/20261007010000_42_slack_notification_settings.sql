-- slack_notification_settings: editable templates for the matter notice Slack message
-- ("担当者に連絡" on /matters/accounting). Singleton table (id = 1), same shape as
-- budget_declaration_reminder_settings (migration 20). Channel stays fixed by the webhook URL.

CREATE TABLE slack_notification_settings (
  id                          smallint NOT NULL DEFAULT 1 PRIMARY KEY,
  matter_notice_header        text NOT NULL DEFAULT '案件に関して、経理より通達です。',
  matter_notice_body_template text NOT NULL DEFAULT E'案件：{matter}\n担当者：{assignee}\n{message}',
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slack_notification_settings_singleton_check CHECK (id = 1),
  CONSTRAINT slack_notification_settings_header_check
    CHECK (length(btrim(matter_notice_header)) > 0),
  CONSTRAINT slack_notification_settings_body_check
    CHECK (length(btrim(matter_notice_body_template)) > 0
           AND position('{message}' in matter_notice_body_template) > 0
           AND position('{assignee}' in matter_notice_body_template) > 0)
);

COMMENT ON TABLE slack_notification_settings IS 'Slack 担当者連絡の定型文設定。1 行のみ（id=1 固定）。詳細: docs/database.md 3.18 / 5.17';

CREATE TRIGGER update_slack_notification_settings_updated_at
    BEFORE UPDATE ON slack_notification_settings
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

INSERT INTO slack_notification_settings DEFAULT VALUES;

-- Only the existing row is updated; no INSERT / DELETE policies and the grants are revoked as well.
ALTER TABLE slack_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slack_notification_settings_select_policy"
  ON slack_notification_settings
  FOR SELECT TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'));

CREATE POLICY "slack_notification_settings_update_policy"
  ON slack_notification_settings
  FOR UPDATE TO authenticated
  USING (public.auth_user_class() IN ('admin', 'accounting'))
  WITH CHECK (public.auth_user_class() IN ('admin', 'accounting'));

GRANT SELECT, UPDATE ON TABLE slack_notification_settings TO authenticated;
REVOKE INSERT, DELETE ON TABLE slack_notification_settings FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE slack_notification_settings TO service_role;
REVOKE ALL ON TABLE slack_notification_settings FROM anon;
