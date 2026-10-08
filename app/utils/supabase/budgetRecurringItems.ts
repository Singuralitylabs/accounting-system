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
import { INSUFFICIENT_PRIVILEGE, isRecurringItemsConflictError } from "./errorCodes";
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

type SaveRecurringItemPayload = ReturnType<typeof toPayloadRow> & {
  state: "new" | "edited" | "removed" | "keep";
};

const toPayloadRow = (row: BudgetRecurringItemInListType) => ({
  id: row.id,
  updated_at: row.updated_at,
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

// Bulk save with staged edits, same approach as bulkUpsertRecurringCost in RecurringCostList. Writes and
// concurrent-edit detection run in one transaction (save_budget_recurring_items, migration 45), so a
// failure or a conflict never leaves the save partially applied.
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

  const canWriteTeam = (team: string) =>
    canWriteBudgetTeam(
      profileInfo.class,
      profileInfo.team,
      team,
      profileInfo.is_teamleader,
    );

  // Rows of teams the user cannot write are read-only and never saved, so their problems (e.g. a
  // category removed from the master) must not block saving the user's own rows.
  const writableRows = rows.filter((row) => canWriteTeam(row.team));

  const validation = validateBudgetRecurringItemList(writableRows);
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
  // all teams (array index) would touch other teams' untouched rows; per team, untouched teams are
  // not written. Teams the user cannot write keep their stored order and are never sent.
  const orderByTeam = new Map<string, number>();
  const payload: SaveRecurringItemPayload[] = [];
  for (const row of rows) {
    if (!canWriteTeam(row.team)) {
      // Read-only rows come back as displayed and are ignored. Adding or deleting another team's row
      // is rejected here, before any DB round trip, for a clearer message; RLS inside the function is
      // the last defense and also checks an edited row's stored team (moving a row out of another
      // team's list is a write to it too).
      if ((row.isRemoved && !row.isNew) || (row.isNew && !row.isRemoved)) {
        return {
          error: {
            kind: "forbidden",
            message: `${row.team}の${SUBJECT}を編集する権限がありません。`,
          },
        };
      }
      continue;
    }
    if (row.isRemoved) {
      // A new row removed before saving never reached the DB.
      if (!row.isNew) {
        payload.push({ state: "removed", ...toPayloadRow(row) });
      }
      continue;
    }
    const order = orderByTeam.get(row.team) ?? 0;
    orderByTeam.set(row.team, order + 1);
    const numbered = { ...row, display_order: order };
    if (row.isNew) {
      payload.push({ state: "new", ...toPayloadRow(numbered) });
    } else if (row.isEdited) {
      payload.push({ state: "edited", ...toPayloadRow(numbered) });
    } else if (row.display_order !== order) {
      // Untouched row sent only to renumber; the function ignores it if someone else changed it.
      payload.push({ state: "keep", ...toPayloadRow(numbered) });
    }
  }

  if (payload.length === 0) {
    return {};
  }

  const supabase = createServerSupabase();

  // The category master check mirrors saveBudgetDeclaration: recurring lines expand into later
  // declarations, so an invalid value here would spread. It uses the server's latest values, not the
  // client's master.
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
  const categoryValidation = validateBudgetRecurringItemList(writableRows, {
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

  // Only rows actually written need a manager check (untouched rows may reference a removed member).
  const managerIds = Array.from(
    new Set(
      payload
        .filter((row) => row.state === "new" || row.state === "edited")
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

  const { error: rpcError } = await supabase.rpc("save_budget_recurring_items", {
    p_rows: payload,
  });

  if (rpcError) {
    if (isRecurringItemsConflictError(rpcError)) {
      return {
        error: {
          kind: "validationFailed",
          message: `${SUBJECT}が他のユーザーによって変更されました。何も保存されていません。画面を再読み込みしてやり直してください。`,
        },
      };
    }
    console.error(`${SUBJECT}の一括更新でエラーが発生しました:`, rpcError);
    // No SQLSTATE means the request never got a database answer (network failure / timeout), so the
    // commit may have happened. Throw without a kind: the client then drops the form and refetches
    // instead of keeping rows that would be inserted twice on a re-save.
    if (!rpcError.code) {
      throw new Error(`${SUBJECT}の更新結果を確認できませんでした。`);
    }
    if (rpcError.code === INSUFFICIENT_PRIVILEGE) {
      return {
        error: {
          kind: "forbidden",
          message: `${SUBJECT}を編集する権限がありません。`,
        },
      };
    }
    return {
      error: {
        kind: "fetchFailed",
        message: `${SUBJECT}の更新に失敗しました。何も保存されていません。`,
      },
    };
  }

  return {};
};
