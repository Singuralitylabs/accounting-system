import { describe, expect, it } from "vitest";
import {
  MAX_ITEM_AMOUNT,
  getBudgetRecurringItemValidationMessage,
  validateBudgetRecurringItem,
  validateBudgetRecurringItemList,
} from "@/app/utils/budgetRecurringItemValidation";
import { BudgetRecurringItemInListType } from "@/app/types/types";

const baseRow = (
  overrides: Partial<BudgetRecurringItemInListType> = {},
): BudgetRecurringItemInListType => ({
  id: 1,
  team: "Aチーム",
  entry_type: "income",
  category: "セミナー",
  description: "○○保守契約",
  amount: 100000,
  manager_id: null,
  start_month: "2026-10-01",
  end_month: null,
  display_order: 0,
  inserted_at: "",
  updated_at: "",
  isNew: false,
  isRemoved: false,
  ...overrides,
});

describe("validateBudgetRecurringItem", () => {
  it("必須項目が揃っていれば ok", () => {
    expect(validateBudgetRecurringItem(baseRow())).toBe("ok");
  });

  it("チーム・種別・分類・内容・適用開始月のいずれかが未入力なら required", () => {
    expect(validateBudgetRecurringItem(baseRow({ team: "" }))).toBe("required");
    expect(validateBudgetRecurringItem(baseRow({ entry_type: "" }))).toBe(
      "required",
    );
    expect(validateBudgetRecurringItem(baseRow({ category: "" }))).toBe(
      "required",
    );
    expect(validateBudgetRecurringItem(baseRow({ description: "" }))).toBe(
      "required",
    );
    expect(validateBudgetRecurringItem(baseRow({ start_month: "" }))).toBe(
      "required",
    );
  });

  it("entry_type が income/expense 以外なら required", () => {
    expect(
      validateBudgetRecurringItem(baseRow({ entry_type: "unknown" })),
    ).toBe("required");
  });

  it("金額が0以下なら amount", () => {
    expect(validateBudgetRecurringItem(baseRow({ amount: 0 }))).toBe("amount");
    expect(validateBudgetRecurringItem(baseRow({ amount: -1 }))).toBe("amount");
  });

  it("金額が上限を超えると amount_overflow", () => {
    expect(
      validateBudgetRecurringItem(baseRow({ amount: MAX_ITEM_AMOUNT })),
    ).toBe("ok");
    expect(
      validateBudgetRecurringItem(baseRow({ amount: MAX_ITEM_AMOUNT + 1 })),
    ).toBe("amount_overflow");
  });

  it("manager_id は null なら ok、不正な値（非整数・0以下）なら manager_id", () => {
    expect(validateBudgetRecurringItem(baseRow({ manager_id: null }))).toBe(
      "ok",
    );
    expect(validateBudgetRecurringItem(baseRow({ manager_id: 5 }))).toBe("ok");
    expect(validateBudgetRecurringItem(baseRow({ manager_id: 0 }))).toBe(
      "manager_id",
    );
    expect(validateBudgetRecurringItem(baseRow({ manager_id: -1 }))).toBe(
      "manager_id",
    );
    expect(validateBudgetRecurringItem(baseRow({ manager_id: 1.5 }))).toBe(
      "manager_id",
    );
  });

  it("適用終了月が適用開始月より前なら period", () => {
    expect(
      validateBudgetRecurringItem(
        baseRow({ start_month: "2026-10-01", end_month: "2026-09-01" }),
      ),
    ).toBe("period");
  });

  it("適用終了月が適用開始月以降、または未設定（継続中）なら ok", () => {
    expect(
      validateBudgetRecurringItem(
        baseRow({ start_month: "2026-10-01", end_month: "2026-10-01" }),
      ),
    ).toBe("ok");
    expect(
      validateBudgetRecurringItem(
        baseRow({ start_month: "2026-10-01", end_month: "2026-12-01" }),
      ),
    ).toBe("ok");
    expect(
      validateBudgetRecurringItem(
        baseRow({ start_month: "2026-10-01", end_month: null }),
      ),
    ).toBe("ok");
  });
});

describe("validateBudgetRecurringItemList", () => {
  it("削除予定（isRemoved）の行は検証対象から除外する", () => {
    expect(
      validateBudgetRecurringItemList([
        baseRow({ id: 1, team: "", isRemoved: true }),
        baseRow({ id: 2 }),
      ]),
    ).toBe("ok");
  });

  it("削除予定でない行に不備があれば最初の理由を返す", () => {
    expect(
      validateBudgetRecurringItemList([
        baseRow({ id: 1 }),
        baseRow({ id: 2, amount: 0 }),
      ]),
    ).toBe("amount");
  });

  it("行が 0 件なら ok", () => {
    expect(validateBudgetRecurringItemList([])).toBe("ok");
  });
});

describe("getBudgetRecurringItemValidationMessage", () => {
  it("理由に応じたメッセージを返す", () => {
    expect(getBudgetRecurringItemValidationMessage("required")).toContain(
      "必須です",
    );
    expect(getBudgetRecurringItemValidationMessage("amount")).toContain(
      "0より大きい",
    );
    expect(
      getBudgetRecurringItemValidationMessage("amount_overflow"),
    ).toContain("大きすぎます");
    expect(getBudgetRecurringItemValidationMessage("manager_id")).toContain(
      "担当者",
    );
    expect(getBudgetRecurringItemValidationMessage("period")).toContain(
      "適用終了月",
    );
  });
});
