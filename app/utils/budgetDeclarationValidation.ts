// 事前収支申告フォーム（作成・編集）のバリデーション純粋関数。
// DB アクセス（"use server" が付く app/utils/supabase/budgetDeclarations.ts）から
// 切り離しているのは、副作用なしでユニットテストできるようにするため
// （docs/testing.md「2.6 テスト容易化リファクタリング方針」）。

import { BudgetDeclarationItemInput } from "../types/types";

export type BudgetDeclarationHeaderInput = {
  targetMonth: string;
  team: string;
};

export type BudgetDeclarationValidationReason =
  | "header_required"
  | "item_required"
  | "item_amount";

export type BudgetDeclarationValidationResult =
  | { ok: true }
  | { ok: false; reason: BudgetDeclarationValidationReason };

export const BUDGET_DECLARATION_VALIDATION_MESSAGES: Record<
  BudgetDeclarationValidationReason,
  string
> = {
  header_required: "対象月・チームは必須です。",
  item_required: "明細の種別・分類・内容が未入力の行があります。",
  item_amount: "明細の金額は0より大きい値を入力してください。",
};

export const hasBudgetDeclarationRequiredHeader = (
  header: BudgetDeclarationHeaderInput,
): boolean => !!(header.targetMonth && header.team);

// 明細 1 行の妥当性。"ok" 以外は理由を返し、呼び出し側でメッセージを出し分ける
export const validateBudgetDeclarationItem = (
  item: BudgetDeclarationItemInput,
): "ok" | "required" | "amount" => {
  // trim() で空白のみの入力（例: 内容に半角スペースのみ）も未入力扱いにする
  if (
    !item.entry_type.trim() ||
    !item.category.trim() ||
    !item.description.trim()
  ) {
    return "required";
  }
  // DB の CHECK (amount > 0) と同じ基準。NaN も弾く
  if (!(item.amount > 0)) {
    return "amount";
  }
  return "ok";
};

// ヘッダ必須項目と明細（種別・分類・内容の必須、金額 > 0）をまとめて検証する。
// 明細 0 件（コメントのみの申告）は許容する（DB 側も明細 0 件のヘッダを許容するため）
export const validateBudgetDeclarationPayload = (
  header: BudgetDeclarationHeaderInput,
  items: readonly BudgetDeclarationItemInput[],
): BudgetDeclarationValidationResult => {
  if (!hasBudgetDeclarationRequiredHeader(header)) {
    return { ok: false, reason: "header_required" };
  }

  for (const item of items) {
    const result = validateBudgetDeclarationItem(item);
    if (result === "required") {
      return { ok: false, reason: "item_required" };
    }
    if (result === "amount") {
      return { ok: false, reason: "item_amount" };
    }
  }

  return { ok: true };
};

export const getBudgetDeclarationValidationMessage = (
  reason: BudgetDeclarationValidationReason,
): string => BUDGET_DECLARATION_VALIDATION_MESSAGES[reason];

// (target_month, team) の一意制約違反（Postgres 23505）かどうかを判定する。
// upsert ではなく素朴な INSERT にしているのは、既に他の担当者が作成した申告を
// 気付かず上書きするのを防ぎ、「既に申告済み」であることを利用者に明示するため。
export const isDuplicateDeclarationError = (
  error: { code?: string } | null | undefined,
): boolean => error?.code === "23505";

export const DUPLICATE_DECLARATION_MESSAGE =
  "この対象月・チームの事前収支申告は既に登録されています。一覧から編集してください。";
