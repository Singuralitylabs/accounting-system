"use server";

import {
  BudgetDeclarationDetailType,
  BudgetDeclarationListType,
} from "../../types/types";
import {
  BUDGET_DECLARATION_ALLOWED_CLASSES,
  BudgetDeclarationWithItems,
  buildBudgetDeclarationStatusList,
  summarizeBudgetItems,
  toTargetMonthDate,
  visibleBudgetTeams,
} from "../budgetDeclaration";
import { hasClassAccess } from "../permissions";
import { createServerSupabase } from "./clients";
import { getProfileInfo } from "./profiles";
import { getSelectOptions } from "./selectOptions";

// 一覧は集計に必要な列だけを取る（明細の全項目は行を開いたときに詳細側で取得する）。
//
// declared_by の profiles は inner join にしない。profiles の SELECT ポリシー
// （migration 12）で申告者の行が読めない場合に、申告そのものが一覧から消えてしまう
// （エラーも出ない）ため。読めないときは名前だけ null になる。詳細側も同じ理由で
// inner join にしていない。
const DECLARATION_LIST_SELECT = `
  id,
  team,
  comment,
  updated_at,
  profiles!budget_declarations_declared_by_fkey (name),
  budget_declaration_items (entry_type, amount)
`;

// 閲覧権限の確認。middleware はページ遷移しか守らないため、
// Server Action 側でも権限を確認する（多層防御。profitLossReport.ts と同方針）。
const getViewerProfile = async () => {
  const { profileInfo, error } = await getProfileInfo();
  if (error || !profileInfo) {
    console.error("profiles情報の取得処理で失敗しました。", error);
    return null;
  }

  if (!hasClassAccess(BUDGET_DECLARATION_ALLOWED_CLASSES, profileInfo.class)) {
    console.error("事前収支申告の閲覧権限がありません。");
    return null;
  }

  return profileInfo;
};

// 対象月（month: "YYYY-MM"）のチーム別申告状況を取得する。
// 行の可視範囲は RLS が担保する（チームリーダーは自チームのみ）が、
// 「未申告」を表示するにはチームマスタ側も同じ基準で絞る必要がある。
// 取得失敗と「0 件」を呼び出し元が区別できるよう、失敗時は null を返す。
export const getBudgetDeclarationList = async (
  month: string,
): Promise<BudgetDeclarationListType | null> => {
  const profileInfo = await getViewerProfile();
  if (!profileInfo) {
    return null;
  }

  const supabase = createServerSupabase();

  const [teamResult, declarationResult] = await Promise.all([
    getSelectOptions("team"),
    supabase
      .from("budget_declarations")
      .select(DECLARATION_LIST_SELECT)
      .eq("target_month", toTargetMonthDate(month))
      .order("team", { ascending: true }),
  ]);

  if (teamResult.error || declarationResult.error) {
    console.error(
      "事前収支申告一覧の取得に失敗しました:",
      teamResult.error ?? declarationResult.error,
    );
    return null;
  }

  const teams = visibleBudgetTeams(
    profileInfo.class,
    profileInfo.team,
    teamResult.options.map((option) => option.value),
  );

  const declarations: BudgetDeclarationWithItems[] = (
    declarationResult.data ?? []
  ).map((row) => ({
    id: row.id,
    team: row.team,
    comment: row.comment,
    updated_at: row.updated_at,
    declared_by_name: row.profiles?.name ?? null,
    items: row.budget_declaration_items ?? [],
  }));

  return {
    targetMonth: month.slice(0, 7),
    rows: buildBudgetDeclarationStatusList(teams, declarations),
  };
};

// 対象月 × チームの申告詳細（ヘッダ＋明細）を取得する。
// 未申告（該当行なし）と取得失敗を区別するため、未申告は { declaration: null } ではなく
// null 以外の「該当なし」として扱えるよう、戻り値を判別可能な形にする。
export const getBudgetDeclarationDetail = async (
  month: string,
  team: string,
): Promise<
  | { detail: BudgetDeclarationDetailType | null; error?: undefined }
  | { detail?: undefined; error: Error }
> => {
  const profileInfo = await getViewerProfile();
  if (!profileInfo) {
    return { error: new Error("事前収支申告の閲覧権限がありません。") };
  }

  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from("budget_declarations")
    .select(
      `
      id,
      target_month,
      team,
      comment,
      declared_by,
      inserted_at,
      updated_at,
      profiles!budget_declarations_declared_by_fkey (name),
      budget_declaration_items (*)
    `,
    )
    .eq("target_month", toTargetMonthDate(month))
    .eq("team", team)
    // UNIQUE (target_month, team) により最大 1 行。0 行を error にしないため
    // single() ではなく maybeSingle() を使う
    .maybeSingle();

  if (error) {
    console.error("事前収支申告の取得に失敗しました:", error);
    return { error: new Error("事前収支申告の取得に失敗しました。") };
  }

  if (!data) {
    // 未申告（RLS で見えない場合も同じく該当なしになる）
    return { detail: null };
  }

  const { profiles, budget_declaration_items: items, ...declaration } = data;
  // display_order → id の順で安定させる（DB 側の並びに依存しない）
  const sortedItems = [...(items ?? [])].sort(
    (a, b) => a.display_order - b.display_order || a.id - b.id,
  );

  return {
    detail: {
      declaration,
      declaredByName: profiles?.name ?? null,
      items: sortedItems,
      summary: summarizeBudgetItems(sortedItems),
    },
  };
};
