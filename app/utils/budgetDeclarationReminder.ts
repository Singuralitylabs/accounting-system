// 事前収支申告の未申告 Slack リマインドの純粋関数（対象日判定・未申告チーム抽出・メッセージ生成）。
// DB アクセス（app/utils/supabase/budgetDeclarationReminderData.ts）・Slack Webhook 送信
// （app/utils/slack/sendBudgetDeclarationReminder.ts）から切り離しているのは、副作用なしで
// ユニットテストできるようにするため（docs/testing.md「2.6 テスト容易化リファクタリング方針」）。

import { currentJstDate, formatMonthLabel } from "./formatter";

// リマインド対象日（JST の日）のフォールバックデフォルト値。期限（毎月20日）の
// 数日前から通知する運用のため、20日を含め複数日を対象にしている。
// 実際の対象日は budget_declaration_reminder_settings テーブルで管理し、DB 取得に
// 失敗した場合のみこの値を使う（app/utils/supabase/budgetDeclarationReminderData.ts の
// getBudgetDeclarationReminderTargetDays 参照）。
export const DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS: readonly number[] =
  [15, 18, 20];

// 申告期限（毎月この日まで）。メッセージ本文の表示にのみ使う
// （期限は Slack リマインドのトリガーであり、DB / UI ではロックしない）。
export const BUDGET_DECLARATION_DEADLINE_DAY = 20;

// 今日（JST）がリマインド対象日か。targetDays が空配列の場合は常に false
// （= 対象日リストを空にするとリマインドが停止する運用。Issue #94）。
export const isBudgetDeclarationReminderTargetDay = (
  now: Date,
  targetDays: readonly number[],
): boolean => targetDays.includes(currentJstDate(now));

// チームマスタ全体から、対象月の申告が無いチームを抽出する
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

// 未申告チームごとに、チームリーダーの slack_id（未設定は除外）をまとめる。
// リーダーが複数いるチームは全員分、リーダー不在・slack_id 未設定のチームは
// 空配列になり、buildBudgetDeclarationReminderMessage 側でチーム名のみの表示に落ちる。
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

// リマインド対象チームが 0 件のときは通知しないため null を返す
// （申告済みチームには通知されない = 呼び出し側はこの場合 Slack 送信自体をスキップする）
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
    `【事前収支申告リマインド】${formatMonthLabel(targetMonth)}分が未申告のチームがあります。`,
    ...lines,
    `期限: 毎月${BUDGET_DECLARATION_DEADLINE_DAY}日`,
    declarationUrl,
  ].join("\n");
};
