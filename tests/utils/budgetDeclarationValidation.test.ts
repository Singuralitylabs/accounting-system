import { describe, expect, it } from "vitest";
import { BudgetDeclarationItemInput } from "@/app/types/types";
import {
  BudgetDeclarationValidationReason,
  DUPLICATE_DECLARATION_MESSAGE,
  MAX_ITEM_AMOUNT,
  getBudgetDeclarationValidationMessage,
  hasBudgetDeclarationRequiredHeader,
  isDuplicateDeclarationError,
  validateBudgetDeclarationItem,
  validateBudgetDeclarationPayload,
} from "@/app/utils/budgetDeclarationValidation";

const validItem = (
  overrides: Partial<BudgetDeclarationItemInput> = {},
): BudgetDeclarationItemInput => ({
  entry_type: "income",
  category: "セミナー",
  description: "○○受託案件",
  amount: 100000,
  ...overrides,
});

describe("hasBudgetDeclarationRequiredHeader", () => {
  it("対象月・チームが両方あれば true", () => {
    expect(
      hasBudgetDeclarationRequiredHeader({
        targetMonth: "2026-10",
        team: "開発チーム",
      }),
    ).toBe(true);
  });

  it("対象月・チームのいずれかが欠けると false", () => {
    expect(
      hasBudgetDeclarationRequiredHeader({
        targetMonth: "",
        team: "開発チーム",
      }),
    ).toBe(false);
    expect(
      hasBudgetDeclarationRequiredHeader({ targetMonth: "2026-10", team: "" }),
    ).toBe(false);
  });
});

describe("validateBudgetDeclarationItem", () => {
  it("種別・分類・内容・金額が揃っていれば ok", () => {
    expect(validateBudgetDeclarationItem(validItem())).toBe("ok");
  });

  it("種別・分類・内容のいずれかが空なら required", () => {
    expect(validateBudgetDeclarationItem(validItem({ entry_type: "" }))).toBe(
      "required",
    );
    expect(validateBudgetDeclarationItem(validItem({ category: "" }))).toBe(
      "required",
    );
    expect(validateBudgetDeclarationItem(validItem({ description: "" }))).toBe(
      "required",
    );
  });

  it("空白のみの入力も未入力として required 扱いにする", () => {
    expect(
      validateBudgetDeclarationItem(validItem({ description: "  " })),
    ).toBe("required");
    expect(validateBudgetDeclarationItem(validItem({ category: "　" }))).toBe(
      "required",
    );
  });

  it("金額が0以下なら amount", () => {
    expect(validateBudgetDeclarationItem(validItem({ amount: 0 }))).toBe(
      "amount",
    );
    expect(validateBudgetDeclarationItem(validItem({ amount: -1 }))).toBe(
      "amount",
    );
  });

  it("金額が上限（numeric(15,2)）を超えると overflow", () => {
    expect(
      validateBudgetDeclarationItem(validItem({ amount: MAX_ITEM_AMOUNT })),
    ).toBe("ok");
    expect(
      validateBudgetDeclarationItem(validItem({ amount: MAX_ITEM_AMOUNT + 1 })),
    ).toBe("overflow");
  });

  it("income/expense 以外の種別は required 扱いにする", () => {
    expect(
      validateBudgetDeclarationItem(validItem({ entry_type: "invalid" })),
    ).toBe("required");
    // 前後の空白を trim した上で値そのものが不正なケース
    expect(
      validateBudgetDeclarationItem(validItem({ entry_type: " income " })),
    ).toBe("ok");
    expect(
      validateBudgetDeclarationItem(validItem({ entry_type: "expense" })),
    ).toBe("ok");
  });
});

describe("validateBudgetDeclarationPayload", () => {
  const header = { targetMonth: "2026-10", team: "開発チーム" };

  it("ヘッダ必須項目が欠けると header_required", () => {
    const result = validateBudgetDeclarationPayload(
      { targetMonth: "", team: "開発チーム" },
      [],
    );
    expect(result).toEqual({ ok: false, reason: "header_required" });
  });

  it("明細 0 件（コメントのみ）は許容する", () => {
    expect(validateBudgetDeclarationPayload(header, [])).toEqual({ ok: true });
  });

  it("明細に必須未入力があると item_required", () => {
    const result = validateBudgetDeclarationPayload(header, [
      validItem(),
      validItem({ description: "" }),
    ]);
    expect(result).toEqual({ ok: false, reason: "item_required" });
  });

  it("明細の金額が0以下だと item_amount", () => {
    const result = validateBudgetDeclarationPayload(header, [
      validItem({ amount: 0 }),
    ]);
    expect(result).toEqual({ ok: false, reason: "item_amount" });
  });

  it("明細の金額が上限を超えると item_amount_overflow", () => {
    const result = validateBudgetDeclarationPayload(header, [
      validItem({ amount: MAX_ITEM_AMOUNT + 1 }),
    ]);
    expect(result).toEqual({ ok: false, reason: "item_amount_overflow" });
  });

  it("すべての明細が妥当なら ok", () => {
    const result = validateBudgetDeclarationPayload(header, [
      validItem(),
      validItem({ entry_type: "expense", category: "外注費" }),
    ]);
    expect(result).toEqual({ ok: true });
  });
});

describe("getBudgetDeclarationValidationMessage", () => {
  it("理由ごとに案内メッセージを返す", () => {
    const reasons: BudgetDeclarationValidationReason[] = [
      "header_required",
      "item_required",
      "item_amount",
      "item_amount_overflow",
    ];
    for (const reason of reasons) {
      expect(getBudgetDeclarationValidationMessage(reason)).toMatch(/./);
    }
  });
});

describe("isDuplicateDeclarationError", () => {
  it("Postgres の一意制約違反（23505）を判定する", () => {
    expect(isDuplicateDeclarationError({ code: "23505" })).toBe(true);
  });

  it("それ以外のエラー・null・undefined は false", () => {
    expect(isDuplicateDeclarationError({ code: "23000" })).toBe(false);
    expect(isDuplicateDeclarationError(null)).toBe(false);
    expect(isDuplicateDeclarationError(undefined)).toBe(false);
  });
});

describe("DUPLICATE_DECLARATION_MESSAGE", () => {
  it("空文字ではない", () => {
    expect(DUPLICATE_DECLARATION_MESSAGE.length).toBeGreaterThan(0);
  });
});
