import {
  DEFAULT_MATTER_NOTICE_SETTINGS,
  MatterNoticeSettings,
} from "../slackNotificationTemplate";
import { createServiceRoleSupabase } from "./clients";

// Service-role read for sending (the sender may not be allowed to read the settings under RLS).
// Falls back to the fixed defaults on any failure so the notification is never blocked; the try/catch
// also covers createServiceRoleSupabase() throwing when env vars are unset.
export const getMatterNoticeSettingsForSend =
  async (): Promise<MatterNoticeSettings> => {
    try {
      const supabase = createServiceRoleSupabase();
      const { data, error } = await supabase
        .from("slack_notification_settings")
        .select("matter_notice_header, matter_notice_body_template")
        .maybeSingle();

      if (error || !data) {
        console.error(
          "Slack通知設定の取得に失敗しました。デフォルトの定型文で送信します:",
          error,
        );
        return DEFAULT_MATTER_NOTICE_SETTINGS;
      }

      return {
        header: data.matter_notice_header,
        bodyTemplate: data.matter_notice_body_template,
      };
    } catch (error) {
      console.error(
        "Slack通知設定の取得で例外が発生しました。デフォルトの定型文で送信します:",
        error,
      );
      return DEFAULT_MATTER_NOTICE_SETTINGS;
    }
  };
