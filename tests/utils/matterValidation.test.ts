import { describe, expect, it } from "vitest";
import {
  getMatterValidationMessage,
  hasCostRequiredFields,
  hasMatterRequiredFields,
  MATTER_VALIDATION_ALERTS,
  validateBusinessEntry,
  validateMatterPayload,
  type MatterValidationReason,
} from "@/app/utils/matterValidation";

const validMatter = {
  title: "案件A",
  category: "講演",
  team: "開発",
  start_date: "2026-04-01",
};

const validBusiness = {
  name: "取引先",
  amount: 1000,
  invoice_date: "2026-04-10",
  period_date: "2026-04-20",
};

const validCost = {
  name: "外注",
  item: "謝金",
  payment_target: "先方",
  price: 100,
  period: "2026-04",
  certificate: "請求書",
};

describe("hasMatterRequiredFields", () => {
  it("案件名・分類・チーム・開始日が揃えば true", () => {
    expect(hasMatterRequiredFields(validMatter)).toBe(true);
  });

  it("いずれかが空なら false", () => {
    expect(hasMatterRequiredFields({ ...validMatter, title: "" })).toBe(false);
    expect(hasMatterRequiredFields({ ...validMatter, category: "" })).toBe(
      false,
    );
    expect(hasMatterRequiredFields({ ...validMatter, team: "" })).toBe(false);
    expect(hasMatterRequiredFields({ ...validMatter, start_date: "" })).toBe(
      false,
    );
  });
});

describe("validateBusinessEntry", () => {
  it("必須が揃い請求日が振込期限以前なら ok", () => {
    expect(validateBusinessEntry(validBusiness)).toBe("ok");
    expect(
      validateBusinessEntry({
        ...validBusiness,
        invoice_date: "2026-04-20",
        period_date: "2026-04-20",
      }),
    ).toBe("ok");
  });

  it("amount が 0 でも必須チェックは通る（null のみ欠落とみなす）", () => {
    expect(validateBusinessEntry({ ...validBusiness, amount: 0 })).toBe("ok");
  });

  it("必須欠落は required", () => {
    expect(validateBusinessEntry({ ...validBusiness, name: "" })).toBe(
      "required",
    );
    expect(validateBusinessEntry({ ...validBusiness, amount: null })).toBe(
      "required",
    );
    expect(validateBusinessEntry({ ...validBusiness, invoice_date: "" })).toBe(
      "required",
    );
    expect(validateBusinessEntry({ ...validBusiness, period_date: "" })).toBe(
      "required",
    );
  });

  it("請求日が振込期限より後なら date_order", () => {
    expect(
      validateBusinessEntry({
        ...validBusiness,
        invoice_date: "2026-04-21",
        period_date: "2026-04-20",
      }),
    ).toBe("date_order");
  });
});

describe("hasCostRequiredFields", () => {
  it("必須が揃えば true。price 0 は欠落ではない", () => {
    expect(hasCostRequiredFields(validCost)).toBe(true);
    expect(hasCostRequiredFields({ ...validCost, price: 0 })).toBe(true);
  });

  it("price が null または他項目が空なら false", () => {
    expect(hasCostRequiredFields({ ...validCost, price: null })).toBe(false);
    expect(hasCostRequiredFields({ ...validCost, name: "" })).toBe(false);
    expect(hasCostRequiredFields({ ...validCost, certificate: "" })).toBe(
      false,
    );
  });
});

describe("validateMatterPayload", () => {
  it("問題なければ ok", () => {
    expect(
      validateMatterPayload(validMatter, [validBusiness], [validCost]),
    ).toEqual({ ok: true });
  });

  it("案件必須欠落", () => {
    expect(
      validateMatterPayload({ ...validMatter, title: "" }, [], []),
    ).toEqual({ ok: false, reason: "matter_required" });
  });

  it("取引先の日付逆転を検出する", () => {
    expect(
      validateMatterPayload(
        validMatter,
        [
          {
            ...validBusiness,
            invoice_date: "2026-05-01",
            period_date: "2026-04-01",
          },
        ],
        [],
      ),
    ).toEqual({ ok: false, reason: "business_date_order" });
  });

  it("skipRemoved 時は削除行を検証しない", () => {
    expect(
      validateMatterPayload(
        validMatter,
        [{ ...validBusiness, name: "", isRemoved: true }],
        [{ ...validCost, name: "", isRemoved: true }],
        { skipRemoved: true },
      ),
    ).toEqual({ ok: true });
  });

  it("skipRemoved なしでは削除行も検証する", () => {
    expect(
      validateMatterPayload(
        validMatter,
        [{ ...validBusiness, name: "", isRemoved: true }],
        [],
      ),
    ).toEqual({ ok: false, reason: "business_required" });
  });

  it("取引先の必須欠落は business_required", () => {
    expect(
      validateMatterPayload(
        validMatter,
        [{ ...validBusiness, amount: null }],
        [validCost],
      ),
    ).toEqual({ ok: false, reason: "business_required" });
  });

  it("費用の必須欠落は cost_required", () => {
    expect(
      validateMatterPayload(
        validMatter,
        [validBusiness],
        [{ ...validCost, name: "" }],
      ),
    ).toEqual({ ok: false, reason: "cost_required" });
  });

  it("reason ごとの alert 文言マップが揃っている", () => {
    const reasons: MatterValidationReason[] = [
      "matter_required",
      "business_required",
      "business_date_order",
      "cost_required",
    ];
    for (const reason of reasons) {
      expect(MATTER_VALIDATION_ALERTS[reason]("作成")).toContain("作成");
      expect(MATTER_VALIDATION_ALERTS[reason]("更新")).toContain("更新");
    }
  });
});

describe("getMatterValidationMessage", () => {
  it("作成と更新で動詞だけが変わる", () => {
    expect(getMatterValidationMessage("matter_required", "create")).toBe(
      "案件名、分類、チーム、案件開始日のいずれかが空欄のため、案件の作成を中止しました。",
    );
    expect(getMatterValidationMessage("matter_required", "update")).toBe(
      "案件名、分類、チーム、案件開始日のいずれかが空欄のため、案件の更新を中止しました。",
    );
  });

  it("取引先の日付順とコスト必須の文言を返す", () => {
    expect(getMatterValidationMessage("business_date_order", "create")).toBe(
      "取引先情報の請求日が振込期限より後になっています。\n案件の作成を中止しました。",
    );
    expect(getMatterValidationMessage("cost_required", "update")).toBe(
      "コスト情報に空欄があるため、案件の更新を中止しました。",
    );
  });
});
