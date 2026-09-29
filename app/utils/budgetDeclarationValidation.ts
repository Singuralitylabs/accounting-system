// Pure validation for the budget declaration form, separate from the "use server" DB access so it
// can be unit-tested.

import { BudgetDeclarationItemInput } from "../types/types";
import { UNIQUE_VIOLATION } from "./supabase/errorCodes";
import { isCategoryUnregistered } from "./budgetDeclaration";

export type BudgetDeclarationHeaderInput = {
  targetMonth: string; // "YYYY-MM"
  team: string;
};

export type BudgetDeclarationCategoryMaster = {
  categoryList: readonly string[];
  itemList: readonly string[];
};

export type BudgetDeclarationValidationReason =
  | "header_required"
  | "item_required"
  | "item_amount"
  | "item_amount_overflow"
  | "item_manager_id"
  | "item_category";

export type BudgetDeclarationValidationResult =
  | { ok: true }
  | { ok: false; reason: BudgetDeclarationValidationReason };

// Same domain as the entry_type CHECK. Rejecting early avoids an obscure DB error from the
// INSERT in save_budget_declaration (migration 24); saving is atomic, so no data is lost.
const VALID_ENTRY_TYPES = new Set(["income", "expense"]);

// budget_declaration_items.amount is numeric(15,2); larger values fail with 22003 in the DB.
// Reject early to avoid an obscure error (the save is one transaction, so no data is lost).
export const MAX_ITEM_AMOUNT = 10 ** 13 - 1;

export const BUDGET_DECLARATION_VALIDATION_MESSAGES: Record<
  BudgetDeclarationValidationReason,
  string
> = {
  header_required: "対象月・チームは必須です。",
  item_required: "明細の種別・分類・内容が未入力の行があります。",
  item_amount: "明細の金額は0より大きい値を入力してください。",
  item_amount_overflow: `明細の金額が大きすぎます（上限: ¥${MAX_ITEM_AMOUNT.toLocaleString("ja-JP")}）。`,
  item_manager_id: "明細の担当者の指定が不正です。",
  item_category: "明細の分類がマスタに登録されていません。選び直してください。",
};

export const hasBudgetDeclarationRequiredHeader = (
  header: BudgetDeclarationHeaderInput,
): boolean => !!(header.targetMonth && header.team);

// Returns a reason other than "ok" so callers can vary the message.
export const validateBudgetDeclarationItem = (
  item: BudgetDeclarationItemInput,
  masters?: BudgetDeclarationCategoryMaster,
): "ok" | "required" | "amount" | "overflow" | "manager_id" | "category" => {
  // Whitespace-only input counts as empty.
  const entryType = item.entry_type.trim();
  if (!entryType || !item.category.trim() || !item.description.trim()) {
    return "required";
  }
  if (!VALID_ENTRY_TYPES.has(entryType)) {
    return "required";
  }
  // Matches the DB CHECK (amount > 0); also rejects NaN.
  if (!(item.amount > 0)) {
    return "amount";
  }
  if (item.amount > MAX_ITEM_AMOUNT) {
    return "overflow";
  }
  // manager_id is nullable but otherwise must be a positive integer (profiles.id bigint). The
  // Server Action accepts arbitrary payloads from authorized users; reject a bad value here so it
  // does not surface as an obscure DB error (the save itself is atomic, see saveBudgetDeclaration).
  if (item.manager_id !== null && !Number.isSafeInteger(item.manager_id)) {
    return "manager_id";
  }
  if (item.manager_id !== null && item.manager_id <= 0) {
    return "manager_id";
  }
  // Rejects categories missing from the master so disabled/renamed values cannot keep being used
  // via previous-month copy or reselection. Skipped when masters is omitted (the server checks the DB master).
  if (
    masters &&
    isCategoryUnregistered(
      item.entry_type,
      item.category,
      masters.categoryList,
      masters.itemList,
    )
  ) {
    return "category";
  }
  return "ok";
};

// Zero lines (comment-only declaration) is allowed, as the DB allows it.
export const validateBudgetDeclarationPayload = (
  header: BudgetDeclarationHeaderInput,
  items: readonly BudgetDeclarationItemInput[],
  masters?: BudgetDeclarationCategoryMaster,
): BudgetDeclarationValidationResult => {
  if (!hasBudgetDeclarationRequiredHeader(header)) {
    return { ok: false, reason: "header_required" };
  }

  for (const item of items) {
    const result = validateBudgetDeclarationItem(item, masters);
    if (result === "required") {
      return { ok: false, reason: "item_required" };
    }
    if (result === "amount") {
      return { ok: false, reason: "item_amount" };
    }
    if (result === "overflow") {
      return { ok: false, reason: "item_amount_overflow" };
    }
    if (result === "manager_id") {
      return { ok: false, reason: "item_manager_id" };
    }
    if (result === "category") {
      return { ok: false, reason: "item_category" };
    }
  }

  return { ok: true };
};

export const getBudgetDeclarationValidationMessage = (
  reason: BudgetDeclarationValidationReason,
): string => BUDGET_DECLARATION_VALIDATION_MESSAGES[reason];

// Plain INSERT rather than upsert so another person's existing declaration is not silently
// overwritten and the user is told it is already declared.
export const isDuplicateDeclarationError = (
  error: { code?: string } | null | undefined,
): boolean => error?.code === UNIQUE_VIOLATION;

export const DUPLICATE_DECLARATION_MESSAGE =
  "この対象月・チームの事前収支申告は既に登録されています。一覧から編集してください。";
