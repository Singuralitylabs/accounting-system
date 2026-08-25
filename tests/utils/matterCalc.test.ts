import { describe, expect, it } from "vitest";
import {
  calcMatterTotalsForCreate,
  calcMatterTotalsForEdit,
  sumBusinessAmounts,
  sumCostPrices,
} from "@/app/utils/matterCalc";

describe("sumBusinessAmounts / sumCostPrices（作成時の既存 reduce）", () => {
  it("amount / price を合計する", () => {
    expect(sumBusinessAmounts([{ amount: 100 }, { amount: 250 }])).toBe(350);
    expect(sumCostPrices([{ price: 40 }, { price: 10 }])).toBe(50);
  });

  it("falsy な amount / price（null / 0 / undefined）は足さない", () => {
    expect(
      sumBusinessAmounts([
        { amount: 100 },
        { amount: 0 },
        { amount: null },
        {},
      ]),
    ).toBe(100);
    expect(
      sumCostPrices([{ price: 40 }, { price: 0 }, { price: null }, {}]),
    ).toBe(40);
  });

  it("空配列は 0", () => {
    expect(sumBusinessAmounts([])).toBe(0);
    expect(sumCostPrices([])).toBe(0);
  });
});

describe("calcMatterTotalsForCreate", () => {
  it("売上とコストを独立に合計する", () => {
    expect(
      calcMatterTotalsForCreate(
        [{ amount: 1000 }, { amount: 2000 }],
        [{ price: 300 }, { price: 50 }],
      ),
    ).toEqual({ total_amount: 3000, total_cost: 350 });
  });
});

describe("calcMatterTotalsForEdit（updateMatter の既存集計）", () => {
  it("isRemoved 行を金額・件数から除外する", () => {
    const result = calcMatterTotalsForEdit(
      [
        { amount: 1000, isRemoved: false },
        { amount: 500, isRemoved: true },
        { amount: 200 },
      ],
      [
        { price: 100, isRemoved: false, is_completed: true },
        { price: 80, isRemoved: true, is_completed: false },
        { price: 20, is_completed: true },
      ],
    );

    expect(result.total_amount).toBe(1200);
    expect(result.business_count).toBe(2);
    expect(result.total_cost).toBe(120);
    expect(result.cost_count).toBe(2);
  });

  it("未確認コストは残存行のうち未完了または isNew", () => {
    const result = calcMatterTotalsForEdit(
      [],
      [
        { price: 1, is_completed: true },
        { price: 1, is_completed: false },
        { price: 1, is_completed: true, isNew: true },
        { price: 1, isRemoved: true, is_completed: false },
        { price: 1 },
      ],
    );

    expect(result.unchecked_cost_count).toBe(3);
  });

  it("amount / price が falsy の残存行は金額に足さないが件数には含める", () => {
    const result = calcMatterTotalsForEdit(
      [{ amount: 0 }, { amount: null }, { amount: 10 }],
      [
        { price: 0, is_completed: true },
        { price: 5, is_completed: true },
      ],
    );

    expect(result.total_amount).toBe(10);
    expect(result.business_count).toBe(3);
    expect(result.total_cost).toBe(5);
    expect(result.cost_count).toBe(2);
  });
});
