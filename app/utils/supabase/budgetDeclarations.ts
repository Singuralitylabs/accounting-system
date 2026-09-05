"use server";

import {
  BudgetDeclarationDeleteResult,
  BudgetDeclarationDetailResult,
  BudgetDeclarationListResult,
  BudgetDeclarationSaveInput,
  BudgetDeclarationSaveResult,
} from "../../types/types";
import {
  BUDGET_DECLARATION_ALLOWED_CLASSES,
  BudgetDeclarationWithItems,
  buildBudgetDeclarationStatusList,
  canViewAllBudgetTeams,
  canWriteBudgetTeam,
  ownBudgetTeams,
  visibleBudgetTeams,
} from "../budgetDeclaration";
import {
  DUPLICATE_DECLARATION_MESSAGE,
  getBudgetDeclarationValidationMessage,
  isDuplicateDeclarationError,
  validateBudgetDeclarationPayload,
} from "../budgetDeclarationValidation";
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

  // manager_id の profiles も declared_by と同じく inner join にしない。
  // 担当者の profiles が RLS で読めない場合に明細行ごと消えてしまうのを避けるため
  // （読めないときは managerName だけ null になる）
  const { data, error } = await supabase
    .from("budget_declarations")
    .select(
      "comment, budget_declaration_items (*, profiles!budget_declaration_items_manager_id_fkey (name))",
    )
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
      items: [...(data.budget_declaration_items ?? [])]
        .sort((a, b) => a.display_order - b.display_order || a.id - b.id)
        .map(({ profiles, ...item }) => ({
          ...item,
          managerName: profiles?.name ?? null,
        })),
    },
  };
};

// 申告の作成・編集（ヘッダ + 明細差し替え）。
// declarationId が null なら新規作成、それ以外なら既存ヘッダの更新。
// 明細は「差し替え」方式（既存を全削除→入力内容を全 INSERT）にしている。
// costs.ts のような isNew/isRemoved diff にしないのは、申告の明細は保存のたびに
// フォーム側の配列が最終形そのものであり、差分を追跡する状態を別途持つ必要が
// ないため（複雑さに見合わない）。
export const saveBudgetDeclaration = async (
  input: BudgetDeclarationSaveInput,
): Promise<BudgetDeclarationSaveResult> => {
  const { profileInfo, error: accessError } = await getAuthorizedViewer(
    BUDGET_DECLARATION_ALLOWED_CLASSES,
    SUBJECT,
  );
  if (accessError) {
    return { error: accessError };
  }

  // RLS が最終防御だが、事前にわかりやすいエラーメッセージを返す
  if (!canWriteBudgetTeam(profileInfo.class, profileInfo.team, input.team)) {
    return {
      error: {
        kind: "forbidden",
        message: `${input.team}の${SUBJECT}を編集する権限がありません。`,
      },
    };
  }

  const validation = validateBudgetDeclarationPayload(
    { targetMonth: input.targetMonth, team: input.team },
    input.items,
  );
  if (!validation.ok) {
    return {
      error: {
        kind: "validationFailed",
        message: getBudgetDeclarationValidationMessage(validation.reason),
      },
    };
  }

  const supabase = createServerSupabase();
  const targetMonth = toFirstOfMonth(input.targetMonth);

  const isCreate = input.declarationId === null;
  let declarationId = input.declarationId;

  if (declarationId === null) {
    const { data, error } = await supabase
      .from("budget_declarations")
      .insert({
        target_month: targetMonth,
        team: input.team,
        declared_by: profileInfo.id,
        comment: input.comment,
      })
      .select("id")
      .single();

    if (error) {
      console.error(`${SUBJECT}の作成に失敗しました:`, error);
      if (isDuplicateDeclarationError(error)) {
        return {
          error: { kind: "duplicate", message: DUPLICATE_DECLARATION_MESSAGE },
        };
      }
      return {
        error: { kind: "fetchFailed", message: `${SUBJECT}の作成に失敗しました。` },
      };
    }

    declarationId = data.id;
  } else {
    // team・target_month でも絞る。フォームでは両方とも編集不可（対象月は表示専用、
    // チームは編集時に常に固定）だが、渡された id が別の申告を指していた場合に
    // 誤って別チーム・別月の申告を書き換えないための整合性チェック
    // （RLS がチーム単位のアクセス制御自体は担保する）
    const { data, error } = await supabase
      .from("budget_declarations")
      .update({ declared_by: profileInfo.id, comment: input.comment })
      .eq("id", declarationId)
      .eq("team", input.team)
      .eq("target_month", targetMonth)
      .select("id");

    if (error) {
      console.error(`${SUBJECT}の更新に失敗しました:`, error);
      return {
        error: { kind: "fetchFailed", message: `${SUBJECT}の更新に失敗しました。` },
      };
    }
    // RLS で 0 行 / 削除済みでも PostgREST は error なしで [] を返す
    if (!data || data.length !== 1) {
      return {
        error: {
          kind: "fetchFailed",
          message: `${SUBJECT}の更新対象が見つかりませんでした。既に削除されているか、編集する権限がありません。`,
        },
      };
    }
  }

  // 明細差し替え: 既存明細を全削除してから入力内容を挿入する。
  // 新規作成では既存明細が存在しないため削除は不要（無駄な DB 往復を避ける）
  if (!isCreate) {
    const { error: deleteError } = await supabase
      .from("budget_declaration_items")
      .delete()
      .eq("declaration_id", declarationId);

    if (deleteError) {
      console.error(`${SUBJECT}の明細更新に失敗しました:`, deleteError);
      // ヘッダ（declared_by・コメント）は直前の UPDATE で既に保存済みのため、
      // 呼び出し側に再読み込みを促すため partialWriteFailed にする
      return {
        error: {
          kind: "partialWriteFailed",
          message: `${SUBJECT}の明細更新に失敗しました。`,
        },
      };
    }
  }

  if (input.items.length > 0) {
    const { error: insertError } = await supabase
      .from("budget_declaration_items")
      .insert(
        input.items.map((item, index) => ({
          declaration_id: declarationId,
          // validateBudgetDeclarationItem は trim() 後の空白のみを弾くが、
          // 前後の空白そのものは除去しないため、保存時に正規化する。
          // entry_type は DB の CHECK（income/expense）対象のため特に重要
          // （前後空白付きの値のまま INSERT すると CHECK 違反で失敗する）
          entry_type: item.entry_type.trim(),
          category: item.category.trim(),
          description: item.description.trim(),
          amount: item.amount,
          manager_id: item.manager_id,
          display_order: index,
        })),
      );

    if (insertError) {
      console.error(`${SUBJECT}の明細登録に失敗しました:`, insertError);
      // ヘッダは既に保存済み（新規作成なら本行、編集なら直前の UPDATE）で、
      // 明細だけが未反映のまま残る。呼び出し側に再読み込みを促すため区別する
      return {
        error: {
          kind: "partialWriteFailed",
          message: `${SUBJECT}の明細登録に失敗しました。`,
        },
      };
    }
  }

  return { id: declarationId };
};

// 申告の削除（明細は ON DELETE CASCADE で同時に削除される）
export const deleteBudgetDeclaration = async (
  declarationId: number,
  team: string,
): Promise<BudgetDeclarationDeleteResult> => {
  const { profileInfo, error: accessError } = await getAuthorizedViewer(
    BUDGET_DECLARATION_ALLOWED_CLASSES,
    SUBJECT,
  );
  if (accessError) {
    return { error: accessError };
  }

  if (!canWriteBudgetTeam(profileInfo.class, profileInfo.team, team)) {
    return {
      error: {
        kind: "forbidden",
        message: `${team}の${SUBJECT}を削除する権限がありません。`,
      },
    };
  }

  const supabase = createServerSupabase();

  // .select() を付けないと削除行が返らず、RLS で 0 行になっても error は null に
  // なるため、削除できていないのに成功として扱われてしまう（matters.ts と同方針）。
  // team でも絞るのは update 同様の整合性チェック（渡された id が別チームの
  // 申告を指していた場合に誤って削除しないため）
  const { data, error } = await supabase
    .from("budget_declarations")
    .delete()
    .eq("id", declarationId)
    .eq("team", team)
    .select();

  if (error) {
    console.error(`${SUBJECT}の削除に失敗しました:`, error);
    return {
      error: { kind: "fetchFailed", message: `${SUBJECT}の削除に失敗しました。` },
    };
  }

  if (!data || data.length !== 1) {
    console.error(`${SUBJECT}の削除対象が見つかりませんでした。`, {
      declarationId,
    });
    return {
      error: {
        kind: "fetchFailed",
        message: `${SUBJECT}の削除対象が見つかりませんでした。既に削除されているか、削除する権限がありません。`,
      },
    };
  }

  return {};
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
