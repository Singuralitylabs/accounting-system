"use server";

import {
  BudgetClosingInfo,
  BudgetClosingWriteResult,
  BudgetClosingsResult,
} from "../../types/types";
import { isMonthKey, toFirstOfMonth } from "../formatter";
import { BUDGET_CLOSING_WRITE_CLASSES } from "../permissions";
import { createServerSupabase } from "./clients";
import { UNIQUE_VIOLATION } from "./errorCodes";
import { ViewerAccessResult, getAuthorizedViewer, getLoggedInViewer } from "./viewerAccess";

const SUBJECT = "事前収支申告の月次確定";

// One row per closed month, so the whole table is small. Every viewer of the page may read it.
export const getBudgetDeclarationClosings =
  async (): Promise<BudgetClosingsResult> => {
    const { error: accessError } = await getLoggedInViewer(SUBJECT);
    if (accessError) {
      return { error: accessError };
    }

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("budget_declaration_closings")
      .select("target_month, closed_at, closed_by_name")
      .order("target_month", { ascending: true });

    if (error) {
      console.error(`${SUBJECT}の取得に失敗しました:`, error);
      return {
        error: { kind: "fetchFailed", message: `${SUBJECT}の取得に失敗しました。` },
      };
    }

    const closings: BudgetClosingInfo[] = (data ?? []).map((row) => ({
      month: row.target_month.slice(0, 7),
      closedAt: row.closed_at,
      closedByName: row.closed_by_name,
    }));
    return { closings };
  };

// Shared pre-check for close / reopen: month format, then accounting / admin only.
const authorizeClosingWrite = async (
  month: string,
  subject: string,
): Promise<ViewerAccessResult> => {
  if (!isMonthKey(month)) {
    return {
      error: { kind: "validationFailed", message: "対象月の形式が不正です。" },
    };
  }
  return getAuthorizedViewer(
    BUDGET_CLOSING_WRITE_CLASSES,
    subject,
    `${subject}を行う権限がありません。`,
  );
};

// Closes the month for all teams. The DB (RLS + advisory lock) is the authority; the class check
// here only gives a clearer message. An already-closed month hits the UNIQUE constraint.
export const closeBudgetDeclarationMonth = async (
  month: string,
): Promise<BudgetClosingWriteResult> => {
  const { profileInfo, error } = await authorizeClosingWrite(month, SUBJECT);
  if (!profileInfo) {
    return { error };
  }

  const supabase = createServerSupabase();
  const { error: insertError } = await supabase
    .from("budget_declaration_closings")
    .insert({
      target_month: toFirstOfMonth(month),
      closed_by: profileInfo.id,
    });

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      return {
        error: {
          kind: "validationFailed",
          message:
            "この月は既に確定されています。画面を再読み込みして確認してください。",
        },
      };
    }
    console.error(`${SUBJECT}に失敗しました:`, insertError);
    return {
      error: { kind: "fetchFailed", message: `${SUBJECT}に失敗しました。` },
    };
  }
  return {};
};

export const reopenBudgetDeclarationMonth = async (
  month: string,
): Promise<BudgetClosingWriteResult> => {
  const { profileInfo, error } = await authorizeClosingWrite(
    month,
    "事前収支申告の確定解除",
  );
  if (!profileInfo) {
    return { error };
  }

  const supabase = createServerSupabase();
  // An RLS-rejected DELETE returns 0 rows without an error, so return deleted rows and check the count.
  const { data: deleted, error: deleteError } = await supabase
    .from("budget_declaration_closings")
    .delete()
    .eq("target_month", toFirstOfMonth(month))
    .select("id");

  if (deleteError) {
    console.error("事前収支申告の確定解除に失敗しました:", deleteError);
    return {
      error: {
        kind: "fetchFailed",
        message: "事前収支申告の確定解除に失敗しました。",
      },
    };
  }
  if (!deleted || deleted.length === 0) {
    return {
      error: {
        kind: "validationFailed",
        message:
          "この月は確定されていないか、確定を解除する権限がありません。画面を再読み込みして確認してください。",
      },
    };
  }
  return {};
};
