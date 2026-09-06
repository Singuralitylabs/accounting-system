// 事前収支申告フォーム（作成・編集）のバリデーション純粋関数。
// DB アクセス（"use server" が付く app/utils/supabase/budgetDeclarations.ts）から
// 切り離しているのは、副作用なしでユニットテストできるようにするため
// （docs/testing.md「2.6 テスト容易化リファクタリング方針」）。

import { BudgetDeclarationItemInput } from "../types/types";
import { UNIQUE_VIOLATION } from "./supabase/errorCodes";

export type BudgetDeclarationHeaderInput = {
  targetMonth: string;
  team: string;
};

export type BudgetDeclarationValidationReason =
  | "header_required"
  | "item_required"
  | "item_amount"
  | "item_amount_overflow";

export type BudgetDeclarationValidationResult =
  | { ok: true }
  | { ok: false; reason: BudgetDeclarationValidationReason };

// budget_declaration_items.entry_type の CHECK 制約（income/expense）と同じ値域。
// フォームの Select は必ずこの 2 値しか出さないが、万一これ以外の値が渡ると
// save_budget_declaration（migration 21）内の INSERT が CHECK 違反で失敗する。
// 保存はアトミック（単一トランザクション）なので失敗しても既存データが失われる
// ことはないが、分かりにくい DB エラーになるのを避けるため保存前にここで弾く
const VALID_ENTRY_TYPES = new Set(["income", "expense"]);

// budget_declaration_items.amount は numeric(15,2)（13 桁 + 小数点以下 2 桁）。
// これを超える金額は DB の INSERT が 22003（numeric field overflow）で失敗する。
// 保存は save_budget_declaration（migration 21）内の単一トランザクションのため
// 失敗しても既存データが失われることはないが、分かりにくい DB エラーになるのを
// 避けるため保存前にここで弾く
export const MAX_ITEM_AMOUNT = 10 ** 13 - 1; // 9,999,999,999,999

export const BUDGET_DECLARATION_VALIDATION_MESSAGES: Record<
  BudgetDeclarationValidationReason,
  string
> = {
  header_required: "対象月・チームは必須です。",
  item_required: "明細の種別・分類・内容が未入力の行があります。",
  item_amount: "明細の金額は0より大きい値を入力してください。",
  item_amount_overflow: `明細の金額が大きすぎます（上限: ¥${MAX_ITEM_AMOUNT.toLocaleString("ja-JP")}）。`,
};

export const hasBudgetDeclarationRequiredHeader = (
  header: BudgetDeclarationHeaderInput,
): boolean => !!(header.targetMonth && header.team);

// 明細 1 行の妥当性。"ok" 以外は理由を返し、呼び出し側でメッセージを出し分ける
export const validateBudgetDeclarationItem = (
  item: BudgetDeclarationItemInput,
): "ok" | "required" | "amount" | "overflow" => {
  // trim() で空白のみの入力（例: 内容に半角スペースのみ）も未入力扱いにする
  const entryType = item.entry_type.trim();
  if (!entryType || !item.category.trim() || !item.description.trim()) {
    return "required";
  }
  // income/expense 以外（想定外の値）も未入力と同じ扱いにする
  if (!VALID_ENTRY_TYPES.has(entryType)) {
    return "required";
  }
  // DB の CHECK (amount > 0) と同じ基準。NaN も弾く
  if (!(item.amount > 0)) {
    return "amount";
  }
  // DB の numeric(15,2) 上限と同じ基準
  if (item.amount > MAX_ITEM_AMOUNT) {
    return "overflow";
  }
  return "ok";
};

// ヘッダ必須項目と明細（種別・分類・内容の必須、金額 > 0・上限以下）をまとめて検証する。
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
    if (result === "overflow") {
      return { ok: false, reason: "item_amount_overflow" };
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
): boolean => error?.code === UNIQUE_VIOLATION;

export const DUPLICATE_DECLARATION_MESSAGE =
  "この対象月・チームの事前収支申告は既に登録されています。一覧から編集してください。";
