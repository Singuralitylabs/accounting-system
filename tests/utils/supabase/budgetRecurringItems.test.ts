import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabase,
  getAuthorizedViewer,
  assertManagerIdsExist,
  getActiveSelectOptionsByType,
} = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  getAuthorizedViewer: vi.fn(),
  assertManagerIdsExist: vi.fn(),
  getActiveSelectOptionsByType: vi.fn(),
}));

vi.mock("@/app/utils/supabase/clients", () => ({ createServerSupabase }));
vi.mock("@/app/utils/supabase/viewerAccess", () => ({ getAuthorizedViewer }));
vi.mock("@/app/utils/supabase/profiles", () => ({ assertManagerIdsExist }));
vi.mock("@/app/utils/supabase/selectOptionsCache", () => ({
  getActiveSelectOptionsByType,
}));

import { bulkSaveBudgetRecurringItems } from "@/app/utils/supabase/budgetRecurringItems";
import type { BudgetRecurringItemInListType } from "@/app/types/types";

const baseRow: BudgetRecurringItemInListType = {
  id: 1,
  team: "Aチーム",
  entry_type: "expense",
  category: "外注費",
  description: "○○保守契約",
  amount: 100000,
  manager_id: null,
  start_month: "2026-04-01",
  end_month: null,
  display_order: 0,
  inserted_at: "",
  updated_at: "",
  isNew: false,
  isRemoved: false,
};

describe("bulkSaveBudgetRecurringItems の分類マスタ照合（Issue #116）", () => {
  beforeEach(() => {
    createServerSupabase.mockReset();
    getAuthorizedViewer.mockReset();
    getAuthorizedViewer.mockResolvedValue({
      profileInfo: { id: 1, class: "accounting", team: null },
    });
    assertManagerIdsExist.mockReset();
    assertManagerIdsExist.mockResolvedValue(null);
    getActiveSelectOptionsByType.mockReset();
    getActiveSelectOptionsByType.mockResolvedValue({
      optionsByType: {
        category: [{ value: "セミナー" }],
        item: [{ value: "外注費" }],
      },
      error: null,
    });
  });

  it("マスタに無い分類は validationFailed を返し DB へ行かない", async () => {
    const result = await bulkSaveBudgetRecurringItems([
      { ...baseRow, category: "旧品目" },
    ]);

    expect(result).toEqual({
      error: {
        kind: "validationFailed",
        message:
          "選択された分類がマスタに登録されていません。画面を再読み込みして選び直してください。",
      },
    });
    expect(createServerSupabase).not.toHaveBeenCalled();
  });

  it("分類マスタの取得に失敗したら fetchFailed を返す", async () => {
    getActiveSelectOptionsByType.mockResolvedValue({
      optionsByType: {},
      error: new Error("master fetch failed"),
    });

    const result = await bulkSaveBudgetRecurringItems([baseRow]);

    expect(result).toEqual({
      error: {
        kind: "fetchFailed",
        message: "事前収支申告の定期明細の分類確認に失敗しました。",
      },
    });
    expect(createServerSupabase).not.toHaveBeenCalled();
  });
});
