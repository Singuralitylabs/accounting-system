import {
  DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS,
  type TeamLeaderSlackRow,
} from "../budgetDeclarationReminder";
import { createServiceRoleSupabase } from "./clients";

// Reads target days from budget_declaration_reminder_settings (PRIMARY KEY + CHECK (id = 1): at most one
// row). Falls back to the defaults on a missing row or error so the cron does not stop.
// The try/catch also covers createServiceRoleSupabase() throwing synchronously when env vars are
// unset; otherwise only this path would return 500 daily in such environments.
// Trade-off (fail-open): if the list was emptied on purpose to stop reminders, a transient fetch
// failure reverts to defaults and reminders go out; chosen over failing the cron route with 500.
export const getBudgetDeclarationReminderTargetDays = async (): Promise<
  readonly number[]
> => {
  try {
    const supabase = createServiceRoleSupabase();

    const { data, error } = await supabase
      .from("budget_declaration_reminder_settings")
      .select("target_days")
      .maybeSingle();

    if (error || !data) {
      console.error(
        "事前収支申告リマインドの対象日設定取得に失敗しました。デフォルト値にフォールバックします:",
        error,
      );
      return DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS;
    }

    return data.target_days;
  } catch (error) {
    console.error(
      "事前収支申告リマインドの対象日設定取得で例外が発生しました。デフォルト値にフォールバックします:",
      error,
    );
    return DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS;
  }
};

// Fetches all types and picks team, matching the existing pattern instead of dot-notation filters on embedded resources.
export const getActiveBudgetTeams = async (): Promise<{
  teams: string[];
  error: unknown;
}> => {
  const supabase = createServiceRoleSupabase();

  const { data, error } = await supabase
    .from("select_options")
    .select("value, display_order, select_option_types!inner(name)")
    .eq("is_active", true)
    .order("display_order");

  if (error) {
    console.error("事前収支申告リマインドのチームマスタ取得に失敗しました:", error);
    return { teams: [], error };
  }

  const teams = (data ?? [])
    .filter((row) => row.select_option_types?.name === "team")
    .map((row) => row.value);

  return { teams, error: null };
};

// Only completed declarations count: teams with no header row or an in-progress one still get reminded.
export const getDeclaredBudgetTeams = async (
  targetMonth: string,
): Promise<{ teams: string[]; error: unknown }> => {
  const supabase = createServiceRoleSupabase();

  const { data, error } = await supabase
    .from("budget_declarations")
    .select("team")
    .eq("target_month", targetMonth)
    .not("completed_at", "is", null);

  if (error) {
    console.error("事前収支申告リマインドの申告済みチーム取得に失敗しました:", error);
    return { teams: [], error };
  }

  return { teams: (data ?? []).map((row) => row.team), error: null };
};

export const getTeamLeaderSlackContacts = async (
  teams: readonly string[],
): Promise<{ contacts: TeamLeaderSlackRow[]; error: unknown }> => {
  if (teams.length === 0) return { contacts: [], error: null };

  const supabase = createServiceRoleSupabase();

  const { data, error } = await supabase
    .from("profiles")
    .select("team, slack_id")
    .eq("class", "teamleader")
    .in("team", teams as string[]);

  if (error) {
    console.error("事前収支申告リマインドのチームリーダー取得に失敗しました:", error);
    return { contacts: [], error };
  }

  const contacts = (data ?? []).flatMap((row) =>
    row.team ? [{ team: row.team, slack_id: row.slack_id }] : [],
  );

  return { contacts, error: null };
};

// Closed months get no reminder (nobody can declare any more). Service role bypasses RLS.
export const isBudgetMonthClosed = async (
  targetMonth: string,
): Promise<{ closed: boolean; error: unknown }> => {
  const supabase = createServiceRoleSupabase();

  const { data, error } = await supabase
    .from("budget_declaration_closings")
    .select("id")
    .eq("target_month", targetMonth)
    .maybeSingle();

  if (error) {
    console.error("事前収支申告リマインドの確定状態取得に失敗しました:", error);
    return { closed: false, error };
  }

  return { closed: !!data, error: null };
};
