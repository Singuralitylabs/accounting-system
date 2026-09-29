// Pure validation for the budget_recurring_items admin section. Values shared with
// budget_declaration_items (entry_type / amount cap / manager_id) reuse budgetDeclarationValidation.ts.

import { BudgetRecurringItemInListType } from "../types/types";
import {
  BudgetDeclarationCategoryMaster,
  MAX_ITEM_AMOUNT,
  validateBudgetDeclarationItem,
} from "./budgetDeclarationValidation";

export { MAX_ITEM_AMOUNT };

export type BudgetRecurringItemValidationReason =
  | "required"
  | "amount"
  | "amount_overflow"
  | "manager_id"
  | "period"
  | "category";

export const BUDGET_RECURRING_ITEM_VALIDATION_MESSAGES: Record<
  BudgetRecurringItemValidationReason,
  string
> = {
  required: "チーム・種別・分類・内容・適用開始月は必須です。",
  amount: "金額は0より大きい値を入力してください。",
  amount_overflow: `金額が大きすぎます（上限: ¥${MAX_ITEM_AMOUNT.toLocaleString("ja-JP")}）。`,
  manager_id: "担当者の指定が不正です。",
  period: "適用終了月が適用開始月より前になっています。",
  category: "分類がマスタに登録されていない行があります。選び直してください。",
};

// Delegates the shared checks to validateBudgetDeclarationItem to avoid double definitions; only
// the team / start_month required checks and the period check stay here.
export const validateBudgetRecurringItem = (
  row: BudgetRecurringItemInListType,
  masters?: BudgetDeclarationCategoryMaster,
): "ok" | BudgetRecurringItemValidationReason => {
  if (!row.team.trim() || !row.start_month) {
    return "required";
  }

  const commonResult = validateBudgetDeclarationItem(row, masters);
  if (commonResult === "required") return "required";
  if (commonResult === "amount") return "amount";
  if (commonResult === "overflow") return "amount_overflow";
  if (commonResult === "manager_id") return "manager_id";
  if (commonResult === "category") return "category";

  // Both are month-start dates, so lexical comparison of YYYY-MM is enough.
  if (
    row.end_month &&
    row.end_month.slice(0, 7) < row.start_month.slice(0, 7)
  ) {
    return "period";
  }
  return "ok";
};

// Returns the first problem found.
export const validateBudgetRecurringItemList = (
  rows: readonly BudgetRecurringItemInListType[],
  masters?: BudgetDeclarationCategoryMaster,
): "ok" | BudgetRecurringItemValidationReason => {
  for (const row of rows) {
    if (row.isRemoved) continue;
    const result = validateBudgetRecurringItem(row, masters);
    if (result !== "ok") return result;
  }
  return "ok";
};

export const getBudgetRecurringItemValidationMessage = (
  reason: BudgetRecurringItemValidationReason,
): string => BUDGET_RECURRING_ITEM_VALIDATION_MESSAGES[reason];
