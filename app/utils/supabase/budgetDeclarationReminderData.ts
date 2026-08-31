import type { TeamLeaderSlackRow } from "../budgetDeclarationReminder";
import { createServiceRoleSupabase } from "./clients";

// 有効な team 選択肢を全件取得する（select_options + select_option_types の構成は
// selectOptionsCache.ts と同じ。type 名で絞らず全種類取得してから team だけ抜き出す
// のは、埋め込みリソースへのドット記法フィルタに頼らず既存の実装パターンに揃えるため）。
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

// 対象月に申告済みのチーム一覧
export const getDeclaredBudgetTeams = async (
  targetMonth: string,
): Promise<{ teams: string[]; error: unknown }> => {
  const supabase = createServiceRoleSupabase();

  const { data, error } = await supabase
    .from("budget_declarations")
    .select("team")
    .eq("target_month", targetMonth);

  if (error) {
    console.error("事前収支申告リマインドの申告済みチーム取得に失敗しました:", error);
    return { teams: [], error };
  }

  return { teams: (data ?? []).map((row) => row.team), error: null };
};

// 指定チームのチームリーダー（class = 'teamleader'）の team・slack_id
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
