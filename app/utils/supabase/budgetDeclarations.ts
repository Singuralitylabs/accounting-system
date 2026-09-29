"use server";

import {
  BudgetDeclarationDeleteResult,
  BudgetDeclarationDetailResult,
  BudgetDeclarationListResult,
  BudgetDeclarationPreviousItemsResult,
  BudgetDeclarationSaveInput,
  BudgetDeclarationSaveResult,
} from "../../types/types";
import {
  BUDGET_DECLARATION_ALLOWED_CLASSES,
  BudgetDeclarationWithItems,
  addMonths,
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
import { FOREIGN_KEY_VIOLATION, NO_DATA_FOUND } from "./errorCodes";
import { assertManagerIdsExist } from "./profiles";
import { getSelectOptions } from "./selectOptions";
import { getActiveSelectOptionsByType } from "./selectOptionsCache";
import { getAuthorizedViewer } from "./viewerAccess";

const SUBJECT = "事前収支申告";

// The list fetches only columns needed for aggregation. Do not inner join declared_by's profiles:
// if the profiles SELECT policy (migration 12) hides the declarer, the declaration would vanish
// silently. The name becomes null instead.
const DECLARATION_LIST_SELECT = `
  id,
  team,
  updated_at,
  profiles!budget_declarations_declared_by_fkey (name),
  budget_declaration_items (entry_type, amount)
`;

// RLS bounds visible rows, but showing "not declared" needs the team master filtered the same way.
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

  // Only all-team roles need the master; a teamleader has one team, so skip the fetch and the
  // per-row profiles lookup in can_access_team_budget.
  if (!canViewAllBudgetTeams(profileInfo.class)) {
    const teams = ownBudgetTeams(profileInfo.class, profileInfo.team);
    if (teams.length === 0) {
      // Teamleader without a team: a query would return 0 rows anyway.
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

  // No team filter for all-team roles, so declarations of teams removed from the master (kept by
  // buildBudgetDeclarationStatusList) are not dropped.
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

// Fetched by declaration ID (one round trip). Line visibility is via parent-header RLS (migration 19).
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

  // No inner join on manager_id's profiles either: an unreadable profile would drop the line (managerName becomes null).
  const { data, error } = await supabase
    .from("budget_declarations")
    .select(
      "comment, budget_declaration_items (*, profiles!budget_declaration_items_manager_id_fkey (name))",
    )
    .eq("id", declarationId)
    // maybeSingle so 0 rows (including RLS-hidden) is not an error.
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
      // Stable order independent of the DB.
      items: [...(data.budget_declaration_items ?? [])]
        .sort((a, b) => a.display_order - b.display_order || a.id - b.id)
        .map(({ profiles, ...item }) => ({
          ...item,
          managerName: profiles?.name ?? null,
        })),
    },
  };
};

// For "copy previous month's lines". items: null when there is no previous declaration at all
// (distinct from a declaration with 0 lines, and from a fetch failure) to drive the copy button.
// A teamleader reads only their own team's rows (other teams yield 0 rows via RLS -> null).
export const getPreviousBudgetDeclarationItems = async (
  targetMonth: string,
  team: string,
): Promise<BudgetDeclarationPreviousItemsResult> => {
  const { error: accessError } = await getAuthorizedViewer(
    BUDGET_DECLARATION_ALLOWED_CLASSES,
    SUBJECT,
  );
  if (accessError) {
    return { error: accessError };
  }

  const supabase = createServerSupabase();
  const previousMonth = toFirstOfMonth(addMonths(targetMonth, -1));

  const { data, error } = await supabase
    .from("budget_declarations")
    .select(
      "budget_declaration_items (id, entry_type, category, description, amount, manager_id, display_order)",
    )
    .eq("target_month", previousMonth)
    .eq("team", team)
    // (target_month, team) is UNIQUE; maybeSingle so 0 rows (not declared / RLS-hidden) is not an error.
    .maybeSingle();

  if (error) {
    console.error("前月の事前収支申告明細の取得に失敗しました:", error);
    return {
      error: {
        kind: "fetchFailed",
        message: `前月の${SUBJECT}の取得に失敗しました。`,
      },
    };
  }

  if (!data) {
    return { items: null };
  }

  return {
    // Sorted here once, same as getBudgetDeclarationDetail; previousItemsToFormRows does not re-sort.
    items: [...(data.budget_declaration_items ?? [])].sort(
      (a, b) => a.display_order - b.display_order || a.id - b.id,
    ),
  };
};

// Create (declarationId null) or update the header and replace lines (delete all, INSERT all): the
// form array is the final state, so isNew/isRemoved diffing like costs.ts would add complexity for nothing.
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

  // RLS is the last defense; this returns a clearer message first.
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

  // Type checks cannot verify manager_id exists in profiles (a member may be deleted after the form
  // opens). Check before saving to avoid an obscure FK violation (23503). Use assertManagerIdsExist()
  // (validateMemberIds() = validate_member_ids, migration 21), not a direct profiles SELECT: RLS
  // limits a teamleader to their team and would misjudge other teams' members as missing. Only the
  // given ID set is checked instead of fetching all members with get_member_options().
  const managerIds = Array.from(
    new Set(
      input.items
        .map((item) => item.manager_id)
        .filter((id): id is number => id !== null),
    ),
  );
  const managerIdError = await assertManagerIdsExist(
    managerIds,
    SUBJECT,
    "フォームを開き直して選び直してください。",
  );
  if (managerIdError) {
    return { error: managerIdError };
  }

  // Check categories against the DB master before saving: the client Select is editable, so the
  // 「（マスタ未登録）」 label alone cannot prevent reselection, and disabled categories would
  // otherwise carry over via previous-month copy. The server re-fetches the latest active values
  // (getActiveSelectOptionsByType), not the client's lists, to reflect master changes after the form opened.
  const { optionsByType: categoryOptionsByType, error: categoryMasterError } =
    await getActiveSelectOptionsByType(["category", "item"]);
  if (categoryMasterError) {
    console.error(`${SUBJECT}の分類マスタ確認に失敗しました:`, categoryMasterError);
    return {
      error: {
        kind: "fetchFailed",
        message: `${SUBJECT}の分類確認に失敗しました。`,
      },
    };
  }
  const categoryValidation = validateBudgetDeclarationPayload(
    { targetMonth: input.targetMonth, team: input.team },
    input.items,
    {
      categoryList: (categoryOptionsByType.category ?? []).map(
        (option) => option.value,
      ),
      itemList: (categoryOptionsByType.item ?? []).map(
        (option) => option.value,
      ),
    },
  );
  if (!categoryValidation.ok && categoryValidation.reason === "item_category") {
    // optionsAtom hydrates only on full page load, so reopening the modal keeps a stale master; ask for a full reload.
    return {
      error: {
        kind: "validationFailed",
        message:
          "選択された分類がマスタに登録されていません。画面を再読み込みして選び直してください。",
      },
    };
  }

  // Header upsert, line delete-all and insert-all run atomically in one DB function transaction
  // (public.save_budget_declaration, migration 24); separate calls could commit with no lines
  // when the INSERT failed after the delete. declared_by is resolved from auth.uid() in the function
  // and never sent by the client (prevents spoofing via PostgREST).
  const { data, error: rpcError } = await supabase
    .rpc("save_budget_declaration", {
      // p_declaration_id / p_comment are DEFAULT NULL, so generated Args are `?: T`: pass undefined
      // (omit the key), not null.
      p_declaration_id: input.declarationId ?? undefined,
      p_target_month: targetMonth,
      p_team: input.team,
      p_comment: input.comment ?? undefined,
      p_items: input.items.map((item) => ({
        // entry_type is under the DB CHECK, so a value with surrounding whitespace would fail it.
        entry_type: item.entry_type.trim(),
        category: item.category.trim(),
        description: item.description.trim(),
        amount: item.amount,
        manager_id: item.manager_id,
      })),
    })
    .single();

  if (rpcError) {
    console.error(`${SUBJECT}の保存に失敗しました:`, rpcError);
    if (isDuplicateDeclarationError(rpcError)) {
      return {
        error: { kind: "duplicate", message: DUPLICATE_DECLARATION_MESSAGE },
      };
    }
    // Detects the function's RAISE EXCEPTION 'DECLARATION_NOT_FOUND' (ERRCODE P0002) by error.code
    // (SQLSTATE), not by message text.
    if (rpcError.code === NO_DATA_FOUND) {
      return {
        error: {
          kind: "fetchFailed",
          message: `${SUBJECT}の更新対象が見つかりませんでした。既に削除されているか、編集する権限がありません。`,
        },
      };
    }
    // TOCTOU: a manager deleted between assertManagerIdsExist and the save causes an FK violation
    // (23503); return the same message as assertManagerIdsExist.
    if (rpcError.code === FOREIGN_KEY_VIOLATION) {
      return {
        error: {
          kind: "validationFailed",
          message:
            "選択された担当者が見つかりません。フォームを開き直して選び直してください。",
        },
      };
    }
    return {
      error: {
        kind: "fetchFailed",
        message:
          input.declarationId === null
            ? `${SUBJECT}の作成に失敗しました。`
            : `${SUBJECT}の更新に失敗しました。`,
      },
    };
  }

  return { id: data.id };
};

// Lines are removed by ON DELETE CASCADE.
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

  // Without .select() no deleted rows return, so RLS filtering to 0 rows would look like success
  // (same as matters.ts). Also filtered by team so a mismatched id cannot delete another team's declaration.
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
