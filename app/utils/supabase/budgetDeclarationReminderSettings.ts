"use server";

// 事前収支申告リマインドの対象日設定を admin / accounting が編集する UI（Issue #97）用の
// Server Action。cron 用の getBudgetDeclarationReminderTargetDays
// （budgetDeclarationReminderData.ts、service role・失敗時はデフォルト値へフォールバック）
// とは別モジュールにしているのは、こちらは RLS 前提（createServerSupabase）で
// getAuthorizedViewer による権限確認を経る通常の Server Action であり、
// service role クライアントは使わないため（Issue #97 仕様どおり）。

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

// id = 1 の既存行への UPDATE のみ（RLS 上 INSERT / DELETE は不可）。
// 呼び出し側（UI）で正規化済みの値を渡す想定だが、Server Action は任意の配列を
// 渡して呼び出せてしまうため、ここでも正規化してから保存する（多層防御）。
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

  // RLS で 0 行になっても PostgREST は error なしで [] を返す
  // （saveBudgetDeclaration などと同方針）。id = 1 の行は migration で必ず
  // 1 行存在する運用のため、0 行は権限不足の取りこぼしを示す
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
