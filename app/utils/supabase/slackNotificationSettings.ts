"use server";

// Server Actions for the admin/accounting notification settings UI; runs under RLS after
// getAuthorizedViewer. Sending reads the same row via service role (see app/actions/slack).

import {
  SlackNotificationSettingsResult,
  SlackNotificationSettingsSaveResult,
} from "../../types/types";
import {
  MatterNoticeSettings,
  validateMatterNoticeSettings,
} from "../slackNotificationTemplate";
import { createServerSupabase } from "./clients";
import { getAuthorizedViewer } from "./viewerAccess";

const SUBJECT = "Slack通知設定";
const ALLOWED_CLASSES = ["admin", "accounting"] as const;

export const getSlackNotificationSettings =
  async (): Promise<SlackNotificationSettingsResult> => {
    const { error: accessError } = await getAuthorizedViewer(
      ALLOWED_CLASSES,
      SUBJECT,
    );
    if (accessError) {
      return { error: accessError };
    }

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("slack_notification_settings")
      .select("matter_notice_header, matter_notice_body_template")
      .maybeSingle();

    if (error || !data) {
      console.error(`${SUBJECT}の取得に失敗しました:`, error);
      return {
        error: {
          kind: "fetchFailed",
          message: `${SUBJECT}の取得に失敗しました。`,
        },
      };
    }

    return {
      settings: {
        header: data.matter_notice_header,
        bodyTemplate: data.matter_notice_body_template,
      },
    };
  };

// UPDATE of the existing id = 1 row only (RLS forbids INSERT / DELETE). Validated again here
// because Server Actions accept arbitrary input (defense in depth).
export const updateSlackNotificationSettings = async (
  settings: MatterNoticeSettings,
): Promise<SlackNotificationSettingsSaveResult> => {
  const { error: accessError } = await getAuthorizedViewer(
    ALLOWED_CLASSES,
    SUBJECT,
  );
  if (accessError) {
    return { error: accessError };
  }

  const validationError = validateMatterNoticeSettings(settings);
  if (validationError) {
    return { error: { kind: "fetchFailed", message: validationError } };
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("slack_notification_settings")
    .update({
      matter_notice_header: settings.header,
      matter_notice_body_template: settings.bodyTemplate,
    })
    .eq("id", 1)
    .select("id");

  if (error) {
    console.error(`${SUBJECT}の更新に失敗しました:`, error);
    return {
      error: {
        kind: "fetchFailed",
        message: `${SUBJECT}の更新に失敗しました。`,
      },
    };
  }

  // RLS filtering to 0 rows returns [] without error; the id = 1 row always exists, so 0 rows means denied.
  if (!data || data.length !== 1) {
    return {
      error: {
        kind: "fetchFailed",
        message: `${SUBJECT}の更新対象が見つかりませんでした。`,
      },
    };
  }

  return {};
};
