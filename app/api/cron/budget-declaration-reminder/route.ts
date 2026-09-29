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
  getBudgetDeclarationReminderTargetDays,
  getDeclaredBudgetTeams,
  getTeamLeaderSlackContacts,
  isBudgetMonthClosed,
} from "@/app/utils/supabase/budgetDeclarationReminderData";

// Runs only from Vercel Cron; force-dynamic disables caching (matches app/layout.tsx).
export const dynamic = "force-dynamic";

// Absolute URL of the declaration page, built from Vercel's automatic env vars (no extra env var needed).
const resolveBudgetDeclarationUrl = (): string => {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const origin = host ? `https://${host}` : "http://localhost:3000";
  return `${origin}/budget-declarations`;
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  // An unset CRON_SECRET would compare against the guessable "Bearer undefined" and let requests through; reject it explicitly.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const targetDays = await getBudgetDeclarationReminderTargetDays();
  if (!isBudgetDeclarationReminderTargetDay(now, targetDays)) {
    return NextResponse.json({ skipped: true, reason: "not-target-day" });
  }

  const targetMonth = defaultTargetMonth(now);

  const closedResult = await isBudgetMonthClosed(toFirstOfMonth(targetMonth));
  if (closedResult.error) {
    return NextResponse.json({ error: "internal-error" }, { status: 500 });
  }
  if (closedResult.closed) {
    return NextResponse.json({ skipped: true, reason: "month-closed" });
  }

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

  // Defensive: reminderTeams is non-empty here, so a null message is not expected today; treat it as internal-error (implementation inconsistency), distinct from all-declared, rather than sending a broken Slack POST.
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
