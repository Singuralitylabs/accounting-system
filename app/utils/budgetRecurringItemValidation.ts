// 事前収支申告の定期明細（budget_recurring_items）管理セクションのバリデーション
// 純粋関数。DB アクセス（"use server" が付く app/utils/supabase/budgetRecurringItems.ts）
// から切り離しているのは、副作用なしでユニットテストできるようにするため
// （docs/testing.md「2.6 テスト容易化リファクタリング方針」）。budget_declaration_items
// と値域が重なる項目（entry_type / amount 上限 / manager_id）は
// budgetDeclarationValidation.ts の定数・判定を再利用し、二重定義を避ける。

import { BudgetRecurringItemInListType } from "../types/types";
import { MAX_ITEM_AMOUNT } from "./budgetDeclarationValidation";

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

// budget_recurring_items.entry_type の CHECK 制約と同じ値域
// （budget_declaration_items と同じ income/expense）
const VALID_ENTRY_TYPES = new Set(["income", "expense"]);

// 明細 1 行の妥当性。"ok" 以外は理由を返し、呼び出し側でメッセージを出し分ける
export const validateBudgetRecurringItem = (
  row: BudgetRecurringItemInListType,
): "ok" | BudgetRecurringItemValidationReason => {
  const entryType = row.entry_type.trim();
  if (
    !row.team.trim() ||
    !entryType ||
    !VALID_ENTRY_TYPES.has(entryType) ||
    !row.category.trim() ||
    !row.description.trim() ||
    !row.start_month
  ) {
    return "required";
  }
  // DB の CHECK (amount > 0) と同じ基準。NaN も弾く
  if (!(row.amount > 0)) {
    return "amount";
  }
  // DB の numeric(15,2) 上限と同じ基準（budget_declaration_items と共通）
  if (row.amount > MAX_ITEM_AMOUNT) {
    return "amount_overflow";
  }
  // manager_id は任意項目（null 許容）。budgetDeclarationValidation と同じ理由
  // （bulkSaveBudgetRecurringItems の書き込みは非トランザクションのため、
  // 不正な値のまま INSERT/UPDATE すると一部のみ反映された状態になりうる）
  if (row.manager_id !== null) {
    if (!Number.isSafeInteger(row.manager_id) || row.manager_id <= 0) {
      return "manager_id";
    }
  }
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
