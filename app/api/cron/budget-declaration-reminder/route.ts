import { NextRequest, NextResponse } from "next/server";
import { defaultTargetMonth } from "@/app/utils/budgetDeclaration";
import {
  buildBudgetDeclarationReminderMessage,
  groupSlackIdsByTeam,
  isBudgetDeclarationReminderTargetDay,
  undeclaredBudgetTeams,
} from "@/app/utils/budgetDeclarationReminder";
import { toFirstOfMonth } from "@/app/utils/formatter";
import { sendBudgetDeclarationReminderToSlack } from "@/app/utils/slack/sendBudgetDeclarationReminder";
import {
  getActiveBudgetTeams,
  getDeclaredBudgetTeams,
  getTeamLeaderSlackContacts,
} from "@/app/utils/supabase/budgetDeclarationReminderData";

// Vercel Cron からのみ実行される Route Handler のため、force-dynamic でキャッシュを無効化する
// （app/layout.tsx の全体設定と揃えているだけで、ここでは実質的にキャッシュ対象にならない）。
export const dynamic = "force-dynamic";

// 申告ページの絶対 URL。Vercel が自動で設定する環境変数から組み立てるため、
// 追加の環境変数設定は不要（docs/setup.md にも専用の環境変数は追加しない）。
const resolveBudgetDeclarationUrl = (): string => {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const origin = host ? `https://${host}` : "http://localhost:3000";
  return `${origin}/budget-declarations`;
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  // CRON_SECRET が未設定だと `Bearer undefined` という推測可能な文字列との比較になり、
  // 環境変数の設定漏れ時にも認証が通ってしまう。未設定は明示的に弾く。
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  if (!isBudgetDeclarationReminderTargetDay(now)) {
    return NextResponse.json({ skipped: true, reason: "not-target-day" });
  }

  const targetMonth = defaultTargetMonth(now);

  const [teamsResult, declaredResult] = await Promise.all([
    getActiveBudgetTeams(),
    getDeclaredBudgetTeams(toFirstOfMonth(targetMonth)),
  ]);

  if (teamsResult.error || declaredResult.error) {
    return NextResponse.json({ error: "internal-error" }, { status: 500 });
  }

  const undeclaredTeams = undeclaredBudgetTeams(
    teamsResult.teams,
    declaredResult.teams,
  );

  if (undeclaredTeams.length === 0) {
    return NextResponse.json({ skipped: true, reason: "all-declared" });
  }

  const { contacts, error: contactsError } =
    await getTeamLeaderSlackContacts(undeclaredTeams);

  if (contactsError) {
    return NextResponse.json({ error: "internal-error" }, { status: 500 });
  }

  const slackIdsByTeam = groupSlackIdsByTeam(undeclaredTeams, contacts);
  const reminderTeams = undeclaredTeams.map((team) => ({
    team,
    slackIds: slackIdsByTeam.get(team) ?? [],
  }));

  const message = buildBudgetDeclarationReminderMessage(
    reminderTeams,
    targetMonth,
    resolveBudgetDeclarationUrl(),
  );

  // reminderTeams は undeclaredTeams（このスコープでは 0 件を弾いた後なので必ず 1 件以上）
  // から作るため、buildBudgetDeclarationReminderMessage が null を返す（teams.length === 0
  // のときのみ）ことは現状ない。将来その条件が増えても壊れた Slack POST を送らないための
  // 防御（ここに来るのは実装不整合なので all-declared とは別の internal-error として扱う）。
  if (!message) {
    console.error(
      "事前収支申告リマインドのメッセージ生成に失敗しました（未申告チームがあるのに message が null）。",
    );
    return NextResponse.json({ error: "internal-error" }, { status: 500 });
  }

  const slackResult = await sendBudgetDeclarationReminderToSlack(message);
  if (slackResult.error) {
    return NextResponse.json(
      { error: "slack-notification-failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({ notifiedTeams: undeclaredTeams });
}
