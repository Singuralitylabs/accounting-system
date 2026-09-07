// 事前収支申告の定期明細（budget_recurring_items）管理セクションのバリデーション
// 純粋関数。DB アクセス（"use server" が付く app/utils/supabase/budgetRecurringItems.ts）
// から切り離しているのは、副作用なしでユニットテストできるようにするため
// （docs/testing.md「2.6 テスト容易化リファクタリング方針」）。budget_declaration_items
// と値域が重なる項目（entry_type / amount 上限 / manager_id）は
// budgetDeclarationValidation.ts の定数・判定を再利用し、二重定義を避ける。

import { BudgetRecurringItemInListType } from "../types/types";
import {
  MAX_ITEM_AMOUNT,
  validateBudgetDeclarationItem,
} from "./budgetDeclarationValidation";

export { MAX_ITEM_AMOUNT };

export type BudgetRecurringItemValidationReason =
  | "required"
  | "amount"
  | "amount_overflow"
  | "manager_id"
  | "period";

export const BUDGET_RECURRING_ITEM_VALIDATION_MESSAGES: Record<
  BudgetRecurringItemValidationReason,
  string
> = {
  required: "チーム・種別・分類・内容・適用開始月は必須です。",
  amount: "金額は0より大きい値を入力してください。",
  amount_overflow: `金額が大きすぎます（上限: ¥${MAX_ITEM_AMOUNT.toLocaleString("ja-JP")}）。`,
  manager_id: "担当者の指定が不正です。",
  period: "適用終了月が適用開始月より前になっています。",
};

// 明細 1 行の妥当性。"ok" 以外は理由を返し、呼び出し側でメッセージを出し分ける。
// entry_type / category / description の必須チェックと amount / manager_id の
// 値域チェックは budget_declaration_items と共通のため
// budgetDeclarationValidation.ts の validateBudgetDeclarationItem に委譲し、
// 二重定義（値域を変えたときの片側直し忘れ）を避ける。team・start_month の
// 必須チェックと適用期間（period）のチェックだけをここに残す
export const validateBudgetRecurringItem = (
  row: BudgetRecurringItemInListType,
): "ok" | BudgetRecurringItemValidationReason => {
  if (!row.team.trim() || !row.start_month) {
    return "required";
  }

  const commonResult = validateBudgetDeclarationItem(row);
  if (commonResult === "required") return "required";
  if (commonResult === "amount") return "amount";
  if (commonResult === "overflow") return "amount_overflow";
  if (commonResult === "manager_id") return "manager_id";

  // 月初日どうしの比較のため文字列の先頭7文字（YYYY-MM）の辞書順比較でよい
  if (
    row.end_month &&
    row.end_month.slice(0, 7) < row.start_month.slice(0, 7)
  ) {
    return "period";
  }
  return "ok";
};

// 削除予定でない行すべてを検証する。最初に見つかった不備の理由を返す
export const validateBudgetRecurringItemList = (
  rows: readonly BudgetRecurringItemInListType[],
): "ok" | BudgetRecurringItemValidationReason => {
  for (const row of rows) {
    if (row.isRemoved) continue;
    const result = validateBudgetRecurringItem(row);
    if (result !== "ok") return result;
  }
  return "ok";
};

export const getBudgetRecurringItemValidationMessage = (
  reason: BudgetRecurringItemValidationReason,
): string => BUDGET_RECURRING_ITEM_VALIDATION_MESSAGES[reason];
