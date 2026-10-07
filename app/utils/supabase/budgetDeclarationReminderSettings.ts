"use server";

// Server Action for the admin/accounting settings UI. Separate from the cron's service-role
// getBudgetDeclarationReminderDays: this one runs under RLS (createServerSupabase) after
// getAuthorizedViewer.

import {
  BudgetDeclarationReminderSettingsResult,
  BudgetDeclarationReminderSettingsSaveResult,
} from "../../types/types";
import {
  BUDGET_DECLARATION_REMINDER_SETTINGS_ALLOWED_CLASSES,
  BudgetDeclarationReminderDay,
  normalizeBudgetDeclarationReminderDays,
  validateBudgetDeclarationReminderMessage,
} from "../budgetDeclarationReminder";
import { createServerSupabase } from "./clients";
import { getAuthorizedViewer } from "./viewerAccess";

const SUBJECT = "事前収支申告リマインド設定";

export const getBudgetDeclarationReminderSettings =
  async (): Promise<BudgetDeclarationReminderSettingsResult> => {
    const { error: accessError } = await getAuthorizedViewer(
      BUDGET_DECLARATION_REMINDER_SETTINGS_ALLOWED_CLASSES,
      SUBJECT,
    );
    if (accessError) {
      return { error: accessError };
    }

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("budget_declaration_reminder_days")
      .select("day, message")
      .order("day");

    if (error || !data) {
      console.error(`${SUBJECT}の取得に失敗しました:`, error);
      return {
        error: {
          kind: "fetchFailed",
          message: `${SUBJECT}の取得に失敗しました。`,
        },
      };
    }

    return { days: data };
  };

// Replaces every row in one RPC transaction. Normalized and validated again here because Server
// Actions accept arbitrary input (defense in depth); the RPC also rejects non-admin / accounting callers.
export const updateBudgetDeclarationReminderDays = async (
  rows: readonly BudgetDeclarationReminderDay[],
): Promise<BudgetDeclarationReminderSettingsSaveResult> => {
  const { error: accessError } = await getAuthorizedViewer(
    BUDGET_DECLARATION_REMINDER_SETTINGS_ALLOWED_CLASSES,
    SUBJECT,
  );
  if (accessError) {
    return { error: accessError };
  }

  const normalized = normalizeBudgetDeclarationReminderDays(rows);
  for (const { day, message } of normalized) {
    const validationError = validateBudgetDeclarationReminderMessage(message);
    if (validationError) {
      return {
        error: {
          kind: "fetchFailed",
          message: `${day}日の${validationError}`,
        },
      };
    }
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc(
    "replace_budget_declaration_reminder_days",
    { p_rows: normalized },
  );

  if (error) {
    console.error(`${SUBJECT}の更新に失敗しました:`, error);
    return {
      error: {
        kind: "fetchFailed",
        message: `${SUBJECT}の更新に失敗しました。`,
      },
    };
  }

  return {};
};
