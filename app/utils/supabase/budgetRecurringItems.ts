"use server";

import {
  ActiveBudgetRecurringItemsResult,
  BudgetRecurringItemInListType,
  BudgetRecurringItemListResult,
  BudgetRecurringItemSaveResult,
} from "../../types/types";
import {
  BUDGET_DECLARATION_VIEW_CLASSES,
  canWriteBudgetTeam,
} from "../budgetDeclaration";
import {
  getBudgetRecurringItemValidationMessage,
  validateBudgetRecurringItemList,
} from "../budgetRecurringItemValidation";
import { toFirstOfMonth, toFirstOfMonthOrNull } from "../formatter";
import { createServerSupabase } from "./clients";
import { assertManagerIdsExist } from "./profiles";
import { getActiveSelectOptionsByType } from "./selectOptionsCache";
import { getAuthorizedViewer } from "./viewerAccess";

const SUBJECT = "事前収支申告の定期明細";

// Every logged-in user reads all teams (SELECT policy, migration 44); writes are limited to the own team (canWriteBudgetTeam).
export const getBudgetRecurringItemList =
  async (): Promise<BudgetRecurringItemListResult> => {
    const { error: accessError } = await getAuthorizedViewer(
      BUDGET_DECLARATION_VIEW_CLASSES,
      SUBJECT,
    );
    if (accessError) {
      return { error: accessError };
    }

    const supabase = createServerSupabase();

    const { data, error } = await supabase
      .from("budget_recurring_items")
      .select("*")
      .order("team", { ascending: true })
      .order("display_order", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      console.error(`${SUBJECT}の取得に失敗しました:`, error);
      return {
        error: { kind: "fetchFailed", message: `${SUBJECT}の取得に失敗しました。` },
      };
    }

    return { items: data ?? [] };
  };

// Recurring lines in the target month's period for the team (end_month NULL or >= month). 0 rows is
// a normal result; only "none" vs "fetch failed" needs distinguishing.
export const getActiveBudgetRecurringItems = async (
  targetMonth: string,
  team: string,
): Promise<ActiveBudgetRecurringItemsResult> => {
  const { error: accessError } = await getAuthorizedViewer(
    BUDGET_DECLARATION_VIEW_CLASSES,
    SUBJECT,
  );
  if (accessError) {
    return { error: accessError };
  }

  const supabase = createServerSupabase();
  const target = toFirstOfMonth(targetMonth);

  const { data, error } = await supabase
    .from("budget_recurring_items")
    .select("id, entry_type, category, description, amount, manager_id, display_order")
    .eq("team", team)
    .lte("start_month", target)
    .or(`end_month.is.null,end_month.gte.${target}`)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error(`${SUBJECT}の取得に失敗しました:`, error);
    return {
      error: { kind: "fetchFailed", message: `${SUBJECT}の取得に失敗しました。` },
    };
  }

  return { items: data ?? [] };
};

const toDbRow = (row: BudgetRecurringItemInListType) => ({
  team: row.team,
  entry_type: row.entry_type.trim(),
  category: row.category.trim(),
  description: row.description.trim(),
  amount: row.amount,
  manager_id: row.manager_id,
  start_month: toFirstOfMonthOrNull(row.start_month)!,
  end_month: toFirstOfMonthOrNull(row.end_month),
  display_order: row.display_order,
});

// Bulk save with staged edits, same approach as bulkUpsertRecurringCost in RecurringCostList
// (INSERT / UPDATE / DELETE run in parallel).
export const bulkSaveBudgetRecurringItems = async (
  rows: BudgetRecurringItemInListType[],
): Promise<BudgetRecurringItemSaveResult> => {
  const { profileInfo, error: accessError } = await getAuthorizedViewer(
    BUDGET_DECLARATION_VIEW_CLASSES,
    SUBJECT,
  );
  if (accessError) {
    return { error: accessError };
  }

  const validation = validateBudgetRecurringItemList(rows);
  if (validation !== "ok") {
    return {
      error: {
        kind: "validationFailed",
        message: getBudgetRecurringItemValidationMessage(validation),
      },
    };
  }

  // Renumber display_order from 0 per team. handleAddRow always adds display_order: 0, so keeping it
  // would put new rows first and break the display_order ordering of the fetches. Numbering across
  // all teams (array index) would mark other teams' untouched rows as changed and defeat the
  // changed-rows-only UPDATE that prevents lost updates; per team, untouched teams are not updated.
  const orderByTeam = new Map<string, number>();
  const activeRows = rows
    .filter((row) => !row.isRemoved)
    .map((row) => {
      const order = orderByTeam.get(row.team) ?? 0;
      orderByTeam.set(row.team, order + 1);
      return { ...row, display_order: order };
    });
  const newRows = activeRows.filter((row) => row.isNew);
  const updateRows = activeRows.filter((row) => !row.isNew);
  const deleteRows = rows.filter((row) => row.isRemoved && !row.isNew);

  // Writes are parallel and non-transactional, so a missing manager_id could leave only some changes applied.
  const managerIds = Array.from(
    new Set(
      [...newRows, ...updateRows]
        .map((row) => row.manager_id)
        .filter((id): id is number => id !== null),
    ),
  );
  const managerIdError = await assertManagerIdsExist(
    managerIds,
    SUBJECT,
    "画面を再読み込みして選び直してください。",
  );
  if (managerIdError) {
    return { error: managerIdError };
  }

  // Check categories against the master before saving (same as saveBudgetDeclaration). Recurring lines
  // expand into later declarations, so an invalid value here would spread. Uses the server's latest
  // values, not the client's master.
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
  const categoryValidation = validateBudgetRecurringItemList(rows, {
    categoryList: (categoryOptionsByType.category ?? []).map(
      (option) => option.value,
    ),
    itemList: (categoryOptionsByType.item ?? []).map((option) => option.value),
  });
  if (categoryValidation === "category") {
    return {
      error: {
        kind: "validationFailed",
        message:
          "選択された分類がマスタに登録されていません。画面を再読み込みして選び直してください。",
      },
    };
  }

  const supabase = createServerSupabase();

  // Staged editing sends every non-deleted existing row as updateRows, and all-team roles edit other
  // teams' rows on the same screen; UPDATEing untouched rows would overwrite a concurrent change
  // (lost update). Compare with current DB values and UPDATE only truly changed rows. Version-based
  // conflict detection (updated_at) is not done here.
  let rowsToUpdate = updateRows;
  let currentRows: { id: number; team: string }[] | null = null;
  if (updateRows.length > 0) {
    const { data, error: currentError } = await supabase
      .from("budget_recurring_items")
      .select(
        "id, team, entry_type, category, description, amount, manager_id, start_month, end_month, display_order",
      )
      .in(
        "id",
        updateRows.map((row) => row.id),
      );

    if (currentError) {
      console.error(`${SUBJECT}の更新前確認に失敗しました:`, currentError);
      return {
        error: {
          kind: "fetchFailed",
          message: `${SUBJECT}の更新前確認に失敗しました。`,
        },
      };
    }

    currentRows = data;
    const currentById = new Map((data ?? []).map((row) => [row.id, row]));
    rowsToUpdate = updateRows.filter((row) => {
      const current = currentById.get(row.id);
      // A row deleted by someone else just before saving hits 0 rows harmlessly; keep it anyway.
      if (!current) return true;
      const desired = toDbRow(row);
      return (Object.keys(desired) as (keyof typeof desired)[]).some(
        (key) => desired[key] !== current[key],
      );
    });
  }

  // RLS is the last defense; check first for a clearer message. Only rows actually written count:
  // everyone sees all teams' lines, so untouched rows of other teams must not block the save. A
  // changed row is checked against both its stored team and its new team (moving a row out of
  // another team's list is a write to that team too).
  const currentTeamById = new Map(
    (currentRows ?? []).map((row) => [row.id, row.team]),
  );
  const writtenTeams = new Set<string>([
    ...newRows.map((row) => row.team),
    ...deleteRows.map((row) => row.team),
    ...rowsToUpdate.flatMap((row) => {
      const stored = currentTeamById.get(row.id);
      return stored ? [row.team, stored] : [row.team];
    }),
  ]);
  const forbiddenTeam = Array.from(writtenTeams).find(
    (team) =>
      !canWriteBudgetTeam(
        profileInfo.class,
        profileInfo.team,
        team,
        profileInfo.is_teamleader,
      ),
  );
  if (forbiddenTeam) {
    return {
      error: {
        kind: "forbidden",
        message: `${forbiddenTeam}の${SUBJECT}を編集する権限がありません。`,
      },
    };
  }

  const operations = [];

  if (newRows.length > 0) {
    operations.push(
      supabase.from("budget_recurring_items").insert(newRows.map(toDbRow)),
    );
  }

  if (rowsToUpdate.length > 0) {
    operations.push(
      ...rowsToUpdate.map((row) =>
        supabase
          .from("budget_recurring_items")
          .update(toDbRow(row))
          .eq("id", row.id),
      ),
    );
  }

  if (deleteRows.length > 0) {
    operations.push(
      supabase
        .from("budget_recurring_items")
        .delete()
        .in(
          "id",
          deleteRows.map((row) => row.id),
        ),
    );
  }

  if (operations.length === 0) {
    return {};
  }

  const results = await Promise.all(operations);
  const errors = results.filter((result) => result.error);

  if (errors.length > 0) {
    console.error(`${SUBJECT}の一括更新でエラーが発生しました:`, errors);
    return {
      error: {
        kind: "partialWriteFailed",
        message: `${SUBJECT}の更新に失敗しました。`,
      },
    };
  }

  return {};
};
