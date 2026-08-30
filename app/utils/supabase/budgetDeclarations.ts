"use server";

import {
  BudgetDeclarationDetailResult,
  BudgetDeclarationListResult,
} from "../../types/types";
import {
  BUDGET_DECLARATION_ALLOWED_CLASSES,
  BudgetDeclarationWithItems,
  buildBudgetDeclarationStatusList,
  canViewAllBudgetTeams,
  ownBudgetTeams,
  visibleBudgetTeams,
} from "../budgetDeclaration";
import { toFirstOfMonth } from "../formatter";
import { createServerSupabase } from "./clients";
import { getSelectOptions } from "./selectOptions";
import { getAuthorizedViewer } from "./viewerAccess";

const SUBJECT = "事前収支申告";

// 一覧は集計に必要な列だけを取る（コメントと明細の全項目は行を開いたときに詳細側で取得する）。
//
// declared_by の profiles は inner join にしない。profiles の SELECT ポリシー
// （migration 12）で申告者の行が読めない場合に、申告そのものが一覧から消えてしまう
// （エラーも出ない）ため。読めないときは名前だけ null になる。
const DECLARATION_LIST_SELECT = `
  id,
  team,
  updated_at,
  profiles!budget_declarations_declared_by_fkey (name),
  budget_declaration_items (entry_type, amount)
`;

// 対象月（month: "YYYY-MM"）のチーム別申告状況を取得する。
// 行の可視範囲は RLS が担保する（チームリーダーは自チームのみ）が、
// 「未申告」を表示するにはチームマスタ側も同じ基準で絞る必要がある。
export const getBudgetDeclarationList = async (
  month: string,
): Promise<BudgetDeclarationListResult> => {
  const { profileInfo, error: accessError } = await getAuthorizedViewer(
    BUDGET_DECLARATION_ALLOWED_CLASSES,
    SUBJECT,
  );
  if (accessError) {
    return { error: accessError };
  }

  const supabase = createServerSupabase();
  const targetMonth = toFirstOfMonth(month);

  // 全チームを見られるロールだけがチームマスタを必要とする。
  // チームリーダーは自チーム 1 行だけなので、マスタ取得も全チーム分の
  // RLS 評価（can_access_team_budget は行ごとに profiles を引く）も避ける。
  if (!canViewAllBudgetTeams(profileInfo.class)) {
    const teams = ownBudgetTeams(profileInfo.class, profileInfo.team);
    if (teams.length === 0) {
      // チーム未設定のチームリーダー。問い合わせても 0 行なので DB に行かない
      return { rows: [] };
    }

    const { data, error } = await supabase
      .from("budget_declarations")
      .select(DECLARATION_LIST_SELECT)
      .eq("target_month", targetMonth)
      .in("team", teams);

    if (error) {
      console.error("事前収支申告一覧の取得に失敗しました:", error);
      return {
        error: { kind: "fetchFailed", message: `${SUBJECT}の取得に失敗しました。` },
      };
    }

    return { rows: buildBudgetDeclarationStatusList(teams, toDeclarations(data)) };
  }

  // 全チーム閲覧ロールでは team で絞らない。チームマスタから外れたチームの
  // 申告（buildBudgetDeclarationStatusList が末尾に残す行）を落とさないため。
  const [teamResult, declarationResult] = await Promise.all([
    getSelectOptions("team"),
    supabase
      .from("budget_declarations")
      .select(DECLARATION_LIST_SELECT)
      .eq("target_month", targetMonth)
      .order("team", { ascending: true }),
  ]);

  if (teamResult.error || declarationResult.error) {
    console.error(
      "事前収支申告一覧の取得に失敗しました:",
      teamResult.error ?? declarationResult.error,
    );
    return {
      error: { kind: "fetchFailed", message: `${SUBJECT}の取得に失敗しました。` },
    };
  }

  const teams = visibleBudgetTeams(
    profileInfo.class,
    profileInfo.team,
    teamResult.options.map((option) => option.value),
  );

  return {
    rows: buildBudgetDeclarationStatusList(
      teams,
      toDeclarations(declarationResult.data),
    ),
  };
};

// 申告 ID（一覧行が保持している）で明細とコメントを取得する。
// 対象月 × チームでの再検索は不要なので、DB 往復は 1 回で済む。
// 明細の可視範囲は親ヘッダ経由の RLS（migration 19）が担保する。
export const getBudgetDeclarationDetail = async (
  declarationId: number,
): Promise<BudgetDeclarationDetailResult> => {
  const { error: accessError } = await getAuthorizedViewer(
    BUDGET_DECLARATION_ALLOWED_CLASSES,
    SUBJECT,
  );
  if (accessError) {
    return { error: accessError };
  }

  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from("budget_declarations")
    .select("comment, budget_declaration_items (*)")
    .eq("id", declarationId)
    // 主キー検索なので最大 1 行。0 行（RLS で見えない場合を含む）を
    // error にしないため single() ではなく maybeSingle() を使う
    .maybeSingle();

  if (error) {
    console.error("事前収支申告の明細取得に失敗しました:", error);
    return {
      error: { kind: "fetchFailed", message: `${SUBJECT}の明細取得に失敗しました。` },
    };
  }

  if (!data) {
    return { detail: null };
  }

  return {
    detail: {
      comment: data.comment,
      // display_order → id の順で安定させる（DB 側の並びに依存しない）
      items: [...(data.budget_declaration_items ?? [])].sort(
        (a, b) => a.display_order - b.display_order || a.id - b.id,
      ),
    },
  };
};

// 一覧クエリの行を集計用の形に変換する
type DeclarationListRow = {
  id: number;
  team: string;
  updated_at: string | null;
  profiles: { name: string | null } | null;
  budget_declaration_items: { entry_type: string; amount: number }[] | null;
};

const toDeclarations = (
  rows: DeclarationListRow[] | null,
): BudgetDeclarationWithItems[] =>
  (rows ?? []).map((row) => ({
    id: row.id,
    team: row.team,
    updated_at: row.updated_at,
    declared_by_name: row.profiles?.name ?? null,
    items: row.budget_declaration_items ?? [],
  }));
