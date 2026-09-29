"use server";

// Server Action for the admin/accounting settings UI. Separate from the cron's service-role
// getBudgetDeclarationReminderTargetDays: this one runs under RLS (createServerSupabase) after
// getAuthorizedViewer.

import {
  BudgetDeclarationReminderSettingsResult,
  BudgetDeclarationReminderSettingsSaveResult,
} from "../../types/types";
import {
  BUDGET_DECLARATION_REMINDER_SETTINGS_ALLOWED_CLASSES,
  normalizeBudgetDeclarationReminderTargetDays,
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
      .from("budget_declaration_reminder_settings")
      .select("target_days")
      .maybeSingle();

    if (error || !data) {
      console.error(`${SUBJECT}の取得に失敗しました:`, error);
      return {
        error: {
          kind: "fetchFailed",
          message: `${SUBJECT}の取得に失敗しました。`,
        },
      };
    }

    return { targetDays: data.target_days };
  };

// UPDATE of the existing id = 1 row only (RLS forbids INSERT / DELETE). Normalized again here
// because Server Actions accept arbitrary arrays (defense in depth).
export const updateBudgetDeclarationReminderTargetDays = async (
  targetDays: readonly number[],
): Promise<BudgetDeclarationReminderSettingsSaveResult> => {
  const { error: accessError } = await getAuthorizedViewer(
    BUDGET_DECLARATION_REMINDER_SETTINGS_ALLOWED_CLASSES,
    SUBJECT,
  );
  if (accessError) {
    return { error: accessError };
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("budget_declaration_reminder_settings")
    .update({
      target_days: normalizeBudgetDeclarationReminderTargetDays(targetDays),
    })
    .eq("id", 1)
    .select("id");

  if (error) {
    console.error(`${SUBJECT}の更新に失敗しました:`, error);
    return {
      error: {
        kind: "fetchFailed",
        message: `${SUBJECT}の更新に失敗しました。`,
      },
    };
  }

  // PostgREST returns [] without error when RLS filters to 0 rows. The id = 1 row always exists, so 0
  // rows means permission denied.
  if (!data || data.length !== 1) {
    return {
      error: {
        kind: "fetchFailed",
        message: `${SUBJECT}の更新対象が見つかりませんでした。`,
      },
    };
  }

  return {};
};
