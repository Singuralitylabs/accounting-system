// Matter notice ("担当者に連絡") template: defaults, placeholders and validation.

import {
  SlackPlaceholder,
  expandSlackTemplate,
  validateSlackTemplate,
} from "./slackTemplate";

// Fallback used when slack_notification_settings cannot be read, and the migration seed values.
export const DEFAULT_MATTER_NOTICE_HEADER = "案件に関して、経理より通達です。";
export const DEFAULT_MATTER_NOTICE_BODY_TEMPLATE =
  "案件：{matter}\n担当者：{assignee}\n{message}";

export const MATTER_NOTICE_PLACEHOLDERS: readonly SlackPlaceholder[] = [
  { key: "matter", description: "案件名", sample: "サンプル案件" },
  {
    key: "assignee",
    description: "担当者（Slack メンション）",
    sample: "@担当者",
  },
  {
    key: "message",
    description: "送信時に入力したメッセージ",
    sample: "ご確認をお願いします。",
  },
  { key: "sender", description: "送信者名", sample: "経理 太郎" },
  { key: "datetime", description: "送信日時", sample: "2026/10/7 9:00:00" },
];

const ALLOWED = MATTER_NOTICE_PLACEHOLDERS.map(({ key }) => key);

export type MatterNoticeSettings = {
  header: string;
  bodyTemplate: string;
};

export const DEFAULT_MATTER_NOTICE_SETTINGS: MatterNoticeSettings = {
  header: DEFAULT_MATTER_NOTICE_HEADER,
  bodyTemplate: DEFAULT_MATTER_NOTICE_BODY_TEMPLATE,
};

// Header takes no placeholders; the body must contain {message}.
export const validateMatterNoticeSettings = ({
  header,
  bodyTemplate,
}: MatterNoticeSettings): string | null =>
  validateSlackTemplate(header, { label: "ヘッダ", allowed: [] }) ??
  validateSlackTemplate(bodyTemplate, {
    label: "本文テンプレート",
    allowed: ALLOWED,
    required: ["message"],
  });

export type MatterNoticeValues = {
  matter: string;
  assignee: string;
  message: string;
  sender: string;
  datetime: string;
};

export const buildMatterNoticeText = (
  settings: MatterNoticeSettings,
  values: MatterNoticeValues,
): string =>
  `${settings.header}\n\n${expandSlackTemplate(settings.bodyTemplate, values)}`;
