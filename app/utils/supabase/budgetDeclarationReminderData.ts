import {
  DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS,
  type TeamLeaderSlackRow,
} from "../budgetDeclarationReminder";
import { createServiceRoleSupabase } from "./clients";

// リマインド対象日を budget_declaration_reminder_settings（PRIMARY KEY + CHECK
// (id = 1) により常に高々 1 行だけが存在する）から取得する。行が無い・取得エラー
// の場合は DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS にフォールバックし、
// cron が対象日判定できずに機能停止することを防ぐ
// （Issue #94 完了条件: DB 取得失敗時も従来どおり動作する）。
//
// try/catch で包むのは、Supabase からの { error } 応答だけでなく
// createServiceRoleSupabase() 自体が投げる例外（環境変数未設定時、
// createClient に渡す URL / キーが undefined で同期的に throw する）も
// 同じフォールバックに乗せるため。ここを取りこぼすと、対象日以外は元々 DB に
// 触れていなかったこの経路だけが env 未設定環境で毎日 500 になる。
//
// 注意: この一括フォールバックは「対象日リストを空にして意図的に停止した」状態でも、
// 取得が一時的に失敗すればデフォルト値に戻ってリマインドが送信される
// トレードオフを内包する（fail-open）。対象日判定という比較的軽微な機能のために
// route を 500 にする fail-closed よりも、cron が無応答で止まらないことを優先した。
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
