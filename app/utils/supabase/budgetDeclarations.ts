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
  BUDGET_MONTH_CLOSED_MESSAGE,
  canWriteBudgetTeam,
  ownBudgetTeams,
} from "../budgetDeclaration";
import {
  DUPLICATE_DECLARATION_MESSAGE,
  getBudgetDeclarationValidationMessage,
  isDuplicateDeclarationError,
  validateBudgetDeclarationPayload,
} from "../budgetDeclarationValidation";
import { toFirstOfMonth } from "../formatter";
import { createServerSupabase } from "./clients";
import {
  FOREIGN_KEY_VIOLATION,
  NO_DATA_FOUND,
  isMonthClosedError,
} from "./errorCodes";
import { assertManagerIdsExist, getMemberOptions } from "./profiles";
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
  completed_at,
  declared_by,
  profiles!budget_declarations_declared_by_fkey (name),
  budget_declaration_items (entry_type, amount)
`;

// Every role that can open the page reads all teams; writing is restricted separately (canWriteBudgetTeam).
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

  // No team filter (every viewer reads all teams, migration 38), so declarations of teams removed from the master (kept by
  // buildBudgetDeclarationStatusList) are not dropped.
  const [teamResult, declarationResult, memberNames] = await Promise.all([
    getSelectOptions("team"),
    supabase
      .from("budget_declarations")
      .select(DECLARATION_LIST_SELECT)
      .eq("target_month", targetMonth)
      .order("team", { ascending: true }),
    fetchMemberNames(),
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

  // A teamleader (including accounting / admin with the flag) whose team was disabled/renamed in the master must still get a row for their own
  // team, or they could never declare it (RLS still allows the write).
  const teams = teamResult.options.map((option) => option.value);
  for (const ownTeam of ownBudgetTeams(
    profileInfo.class,
    profileInfo.team,
    profileInfo.is_teamleader,
  )) {
    if (!teams.includes(ownTeam)) {
      teams.push(ownTeam);
    }
  }

  return {
    rows: buildBudgetDeclarationStatusList(
      teams,
      toDeclarations(declarationResult.data, memberNames),
    ),
  };
};

// Fetched by declaration ID (one round trip). Any viewer may read any team's lines (SELECT policies, migration 38).
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

  // No inner join on manager_id's profiles either: an unreadable profile would drop the line. The
  // join name is filled from the member list when RLS hides it (other teams, for a teamleader).
  const [{ data, error }, memberNames] = await Promise.all([
    supabase
      .from("budget_declarations")
      .select(
        "comment, completed_at, budget_declaration_items (*, profiles!budget_declaration_items_manager_id_fkey (name))",
      )
      .eq("id", declarationId)
      // maybeSingle so 0 rows (including RLS-hidden) is not an error.
      .maybeSingle(),
    fetchMemberNames(),
  ]);

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
      completed: data.completed_at !== null,
      // Stable order independent of the DB.
      items: [...(data.budget_declaration_items ?? [])]
        .sort((a, b) => a.display_order - b.display_order || a.id - b.id)
        .map(({ profiles, ...item }) => ({
          ...item,
          managerName:
            profiles?.name ??
            (item.manager_id === null
              ? null
              : (memberNames.get(item.manager_id) ?? null)),
        })),
    },
  };
};

// For "copy previous month's lines". items: null when there is no previous declaration at all
// (distinct from a declaration with 0 lines, and from a fetch failure) to drive the copy button.
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
  if (!canWriteBudgetTeam(
      profileInfo.class,
      profileInfo.team,
      input.team,
      profileInfo.is_teamleader,
    )) {
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
      // completed_by is resolved from auth.uid() in the function, never sent by the client.
      p_completed: input.completed,
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
    // save_budget_declaration raises MONTH_CLOSED (SQLSTATE 42501) for a closed month (migration 38);
    // a plain RLS denial is also 42501, hence the message check.
    if (isMonthClosedError(rpcError)) {
      return {
        error: { kind: "validationFailed", message: BUDGET_MONTH_CLOSED_MESSAGE },
      };
    }
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

  if (!canWriteBudgetTeam(
      profileInfo.class,
      profileInfo.team,
      team,
      profileInfo.is_teamleader,
    )) {
    return {
      error: {
        kind: "forbidden",
        message: `${team}の${SUBJECT}を削除する権限がありません。`,
      },
    };
  }

  const supabase = createServerSupabase();

  // Runs through delete_budget_declaration (migration 38): it takes the shared month lock and returns
  // MONTH_CLOSED for a closed month. RLS-filtered rows come back as 0 rows (no error), which is
  // checked below (same reason as matters.ts). The team filter keeps a mismatched id from deleting
  // another team's declaration.
  const { data, error } = await supabase.rpc("delete_budget_declaration", {
    p_declaration_id: declarationId,
    p_team: team,
  });

  if (error) {
    console.error(`${SUBJECT}の削除に失敗しました:`, error);
    if (isMonthClosedError(error)) {
      return {
        error: { kind: "validationFailed", message: BUDGET_MONTH_CLOSED_MESSAGE },
      };
    }
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

// id -> name for every member via get_member_options (SECURITY DEFINER). A direct profiles read is
// limited to the own team for a teamleader (RLS), which would show other teams' declarers / managers
// as "-". Auxiliary: on failure return an empty map (names fall back to the RLS-limited join).
const fetchMemberNames = async (): Promise<Map<number, string>> => {
  const { memberOptions, error } = await getMemberOptions();
  if (error) {
    console.error(`${SUBJECT}の担当者名の取得に失敗しました:`, error);
    return new Map();
  }
  return new Map((memberOptions ?? []).map((member) => [member.id, member.name]));
};

type DeclarationListRow = {
  id: number;
  team: string;
  updated_at: string | null;
  completed_at: string | null;
  declared_by: number;
  profiles: { name: string | null } | null;
  budget_declaration_items: { entry_type: string; amount: number }[] | null;
};

const toDeclarations = (
  rows: DeclarationListRow[] | null,
  memberNames: ReadonlyMap<number, string>,
): BudgetDeclarationWithItems[] =>
  (rows ?? []).map((row) => ({
    id: row.id,
    team: row.team,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    declared_by_name:
      row.profiles?.name ?? memberNames.get(row.declared_by) ?? null,
    items: row.budget_declaration_items ?? [],
  }));
