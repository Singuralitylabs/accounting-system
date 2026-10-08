// Pure functions for the unsubmitted-budget-declaration Slack reminder, separate from DB and Webhook
// access so they can be unit-tested.

import { currentJstDate, formatMonthLabel } from "./formatter";
import { ACCOUNTING_ROLES, Role, hasClassAccess } from "./permissions";
import {
  SlackPlaceholder,
  expandSlackTemplate,
  validateSlackTemplate,
} from "./slackTemplate";

export type BudgetDeclarationReminderDay = {
  day: number;
  message: string;
};

// Placeholders in the message header; the team list, deadline line and URL are appended automatically.
export const BUDGET_DECLARATION_REMINDER_PLACEHOLDERS: readonly SlackPlaceholder[] =
  [
    {
      key: "month",
      description: "対象月",
      sample: "2026年10月",
    },
    {
      key: "deadline",
      description: "期限日（毎月の日）",
      sample: "20",
    },
  ];

export const DEFAULT_BUDGET_DECLARATION_REMINDER_MESSAGE =
  "【事前収支申告リマインド】{month}分の事前収支申告が未申告・未完了のチームがあります。";

// Deadline day; only shown in the message (not locked in DB / UI).
export const BUDGET_DECLARATION_DEADLINE_DAY = 20;

// Fallback used only when fetching budget_declaration_reminder_days fails.
// Notification starts a few days before the 20th deadline.
export const DEFAULT_BUDGET_DECLARATION_REMINDER_DAYS: readonly BudgetDeclarationReminderDay[] =
  [15, 18, 20].map((day) => ({
    day,
    message: DEFAULT_BUDGET_DECLARATION_REMINDER_MESSAGE,
  }));

// Null when today is not a target day (an empty list never matches, so emptying it stops reminders).
export const findBudgetDeclarationReminderForDay = (
  now: Date,
  rows: readonly BudgetDeclarationReminderDay[],
): BudgetDeclarationReminderDay | null => {
  const today = currentJstDate(now);
  return rows.find(({ day }) => day === today) ?? null;
};

export const expandBudgetDeclarationReminderMessage = (
  template: string,
  targetMonth: string,
): string =>
  expandSlackTemplate(template, {
    month: formatMonthLabel(targetMonth),
    deadline: String(BUDGET_DECLARATION_DEADLINE_DAY),
  });

// Returns a Japanese error message, or null when valid.
export const validateBudgetDeclarationReminderMessage = (
  message: string,
): string | null =>
  validateSlackTemplate(message, {
    label: "リマインド文面",
    allowed: BUDGET_DECLARATION_REMINDER_PLACEHOLDERS.map(({ key }) => key),
  });

export const undeclaredBudgetTeams = (
  teams: readonly string[],
  declaredTeams: readonly string[],
): string[] => {
  const declared = new Set(declaredTeams);
  return teams.filter((team) => !declared.has(team));
};

export type TeamLeaderSlackRow = {
  team: string;
  slack_id: string | null;
};

// Teams without leaders / slack_id get an empty array; the message then shows the team name only.
export const groupSlackIdsByTeam = (
  undeclaredTeams: readonly string[],
  leaderRows: readonly TeamLeaderSlackRow[],
): Map<string, string[]> => {
  const slackIdsByTeam = new Map<string, string[]>(
    undeclaredTeams.map((team) => [team, []]),
  );

  for (const { team, slack_id } of leaderRows) {
    if (!slack_id) continue;
    slackIdsByTeam.get(team)?.push(slack_id);
  }

  return slackIdsByTeam;
};

export type BudgetDeclarationReminderTeam = {
  team: string;
  slackIds: readonly string[];
};

// header is the already-expanded first line (see expandBudgetDeclarationReminderMessage).
// Null when no team is targeted; callers skip the Slack send.
export const buildBudgetDeclarationReminderMessage = (
  teams: readonly BudgetDeclarationReminderTeam[],
  header: string,
  declarationUrl: string,
): string | null => {
  if (teams.length === 0) return null;

  const lines = teams.map(({ team, slackIds }) => {
    const mention =
      slackIds.length > 0
        ? `${slackIds.map((id) => `<@${id}>`).join(" ")} `
        : "";
    return `- ${mention}${team}`;
  });

  return [
    header,
    ...lines,
    `期限: 毎月${BUDGET_DECLARATION_DEADLINE_DAY}日`,
    declarationUrl,
  ].join("\n");
};

// Sample of the part appended after the header message, in the exact format of the real post.
export const buildBudgetDeclarationReminderSampleAutoText = (): string =>
  // Empty header leaves a leading newline; the preview draws the header separately.
  (
    buildBudgetDeclarationReminderMessage(
      [
        { team: "Aチーム", slackIds: ["U01234567"] },
        { team: "Bチーム", slackIds: [] },
      ],
      "",
      "https://example.com/budget-declarations",
    ) ?? ""
  ).replace(/^\n/, "");

export const isValidBudgetDeclarationReminderTargetDay = (
  day: number,
): boolean => Number.isInteger(day) && day >= 1 && day <= 31;

// Drops out-of-range days, dedupes (the last row for a day wins) and sorts ascending.
export const normalizeBudgetDeclarationReminderDays = (
  rows: readonly BudgetDeclarationReminderDay[],
): BudgetDeclarationReminderDay[] =>
  Array.from(
    new Map(
      rows
        .filter(({ day }) => isValidBudgetDeclarationReminderTargetDay(day))
        .map((row) => [row.day, row] as const),
    ).values(),
  ).sort((a, b) => a.day - b.day);

// Mirrors RLS on budget_declaration_reminder_days (migration 43); change both together.
export const BUDGET_DECLARATION_REMINDER_SETTINGS_ALLOWED_CLASSES: readonly Role[] =
  ACCOUNTING_ROLES;

export const canManageBudgetDeclarationReminderSettings = (
  profileClass: string | null | undefined,
  isTeamleader: boolean | null | undefined,
): boolean =>
  hasClassAccess(
    BUDGET_DECLARATION_REMINDER_SETTINGS_ALLOWED_CLASSES,
    profileClass,
    isTeamleader,
  );
