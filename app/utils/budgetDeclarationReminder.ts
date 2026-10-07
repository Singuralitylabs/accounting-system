// Pure functions for the unsubmitted-budget-declaration Slack reminder, separate from DB and Webhook
// access so they can be unit-tested.

import { currentJstDate, formatMonthLabel } from "./formatter";
import { Role, hasClassAccess } from "./permissions";

// Fallback target days (JST) used only when fetching budget_declaration_reminder_settings fails.
// Notification starts a few days before the 20th deadline.
export const DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS: readonly number[] =
  [15, 18, 20];

// Deadline day; only shown in the message (not locked in DB / UI).
export const BUDGET_DECLARATION_DEADLINE_DAY = 20;

// An empty targetDays is always false (emptying the list stops reminders).
export const isBudgetDeclarationReminderTargetDay = (
  now: Date,
  targetDays: readonly number[],
): boolean => targetDays.includes(currentJstDate(now));

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

// Null when no team is targeted; callers skip the Slack send.
export const buildBudgetDeclarationReminderMessage = (
  teams: readonly BudgetDeclarationReminderTeam[],
  targetMonth: string,
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
    `【事前収支申告リマインド】${formatMonthLabel(targetMonth)}分の事前収支申告が未申告・未完了のチームがあります。`,
    ...lines,
    `期限: 毎月${BUDGET_DECLARATION_DEADLINE_DAY}日`,
    declarationUrl,
  ].join("\n");
};

export const isValidBudgetDeclarationReminderTargetDay = (
  day: number,
): boolean => Number.isInteger(day) && day >= 1 && day <= 31;

// Drops out-of-range values, dedupes and sorts ascending.
export const normalizeBudgetDeclarationReminderTargetDays = (
  days: readonly number[],
): number[] =>
  Array.from(
    new Set(days.filter(isValidBudgetDeclarationReminderTargetDay)),
  ).sort((a, b) => a - b);

// Mirrors RLS on budget_declaration_reminder_settings (select/update, migration 20); change both together.
export const BUDGET_DECLARATION_REMINDER_SETTINGS_ALLOWED_CLASSES: readonly Role[] =
  ["admin", "accounting"];

export const canManageBudgetDeclarationReminderSettings = (
  profileClass: string | null | undefined,
): boolean =>
  hasClassAccess(
    BUDGET_DECLARATION_REMINDER_SETTINGS_ALLOWED_CLASSES,
    profileClass,
    // The list has no teamleader role, so the flag cannot change the result.
    false,
  );
