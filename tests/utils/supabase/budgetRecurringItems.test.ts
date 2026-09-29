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

describe("bulkSaveBudgetRecurringItems の display_order 採番（Issue #136）", () => {
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

  const teamRow = (
    id: number,
    team: string,
    override: Partial<BudgetRecurringItemInListType> = {},
  ): BudgetRecurringItemInListType => ({
    ...baseRow,
    id,
    team,
    // The passed display_order is renumbered, so deliberately scramble it.
    display_order: 99,
    ...override,
  });

  it("display_order をチームごとに 0 から採番し、触っていないチームの行を UPDATE しない", async () => {
    const currentRows = [
      {
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
      },
      {
        id: 2,
        team: "Aチーム",
        entry_type: "expense",
        category: "外注費",
        description: "△△保守契約",
        amount: 100000,
        manager_id: null,
        start_month: "2026-04-01",
        end_month: null,
        display_order: 1,
      },
      {
        id: 3,
        team: "Bチーム",
        entry_type: "expense",
        category: "外注費",
        description: "○○保守契約",
        amount: 100000,
        manager_id: null,
        start_month: "2026-04-01",
        end_month: null,
        display_order: 0,
      },
      {
        id: 4,
        team: "Bチーム",
        entry_type: "expense",
        category: "外注費",
        description: "○○保守契約",
        amount: 100000,
        manager_id: null,
        start_month: "2026-04-01",
        end_month: null,
        display_order: 1,
      },
    ];
    const rows = [
      teamRow(1, "Aチーム"),
      teamRow(2, "Aチーム", { description: "△△保守契約" }),
      teamRow(3, "Bチーム"),
      teamRow(4, "Bチーム", { amount: 200000 }),
    ];

    const updates: { id: number; row: Record<string, unknown> }[] = [];
    const from = vi.fn(() => {
      const query: Record<string, unknown> = {};
      query.select = vi.fn(() => query);
      query.in = vi.fn(() => Promise.resolve({ data: currentRows, error: null }));
      query.update = vi.fn((row: Record<string, unknown>) => ({
        eq: vi.fn((_col: string, id: number) => {
          updates.push({ id, row });
          return Promise.resolve({ error: null });
        }),
      }));
      query.insert = vi.fn(() => Promise.resolve({ error: null }));
      query.delete = vi.fn(() => ({
        in: vi.fn(() => Promise.resolve({ error: null })),
      }));
      return query;
    });
    createServerSupabase.mockReturnValue({ from });

    const result = await bulkSaveBudgetRecurringItems(rows);

    expect(result).toEqual({});
    // Numbering across all teams (0,1,2,3) would make team B's two rows display_order UPDATE targets;
    // per-team numbering (A:0,1 B:0,1) leaves only the changed row.
    expect(updates.map((update) => update.id)).toEqual([4]);
    expect(updates[0].row).toMatchObject({ display_order: 1, amount: 200000 });
  });
});
