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

describe("bulkSaveBudgetRecurringItems の書き込みチーム判定（Issue #245）", () => {
  const dbRow = (id: number, team: string, amount = 100000) => ({
    id,
    team,
    entry_type: "expense",
    category: "外注費",
    description: "○○保守契約",
    amount,
    manager_id: null,
    start_month: "2026-04-01",
    end_month: null,
    display_order: 0,
  });
  const listRow = (
    id: number,
    team: string,
    override: Partial<BudgetRecurringItemInListType> = {},
  ): BudgetRecurringItemInListType => ({ ...baseRow, id, team, ...override });

  const operations = {
    updates: [] as number[],
    inserts: [] as unknown[],
    deletes: [] as number[][],
  };

  const mockSupabase = (currentRows: ReturnType<typeof dbRow>[]) => {
    createServerSupabase.mockReturnValue({
      from: () => {
        const query: Record<string, unknown> = {};
        query.select = vi.fn(() => query);
        query.in = vi.fn(() =>
          Promise.resolve({ data: currentRows, error: null }),
        );
        query.update = vi.fn(() => ({
          eq: vi.fn((_col: string, id: number) => {
            operations.updates.push(id);
            return Promise.resolve({ error: null });
          }),
        }));
        query.insert = vi.fn((rows: unknown) => {
          operations.inserts.push(rows);
          return Promise.resolve({ error: null });
        });
        query.delete = vi.fn(() => ({
          in: vi.fn((_col: string, ids: number[]) => {
            operations.deletes.push(ids);
            return Promise.resolve({ error: null });
          }),
        }));
        return query;
      },
    });
  };

  beforeEach(() => {
    operations.updates = [];
    operations.inserts = [];
    operations.deletes = [];
    createServerSupabase.mockReset();
    getAuthorizedViewer.mockReset();
    getAuthorizedViewer.mockResolvedValue({
      profileInfo: { id: 5, class: "public", is_teamleader: false, team: "Aチーム" },
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

  it("全ユーザーに閲覧が開放されているため、ログイン済みの全ロールで認可を通す", async () => {
    mockSupabase([dbRow(1, "Aチーム")]);

    await bulkSaveBudgetRecurringItems([listRow(1, "Aチーム")]);

    const allowed = getAuthorizedViewer.mock.calls[0][0] as string[];
    expect(allowed).toEqual(
      expect.arrayContaining(["public", "teamleader", "accounting", "admin"]),
    );
  });

  it("所属チームのある public は、他チームの変更していない行が含まれていても自チームの変更を保存できる", async () => {
    mockSupabase([dbRow(1, "Aチーム"), dbRow(2, "Bチーム")]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { amount: 200000 }),
      listRow(2, "Bチーム"),
    ]);

    expect(result).toEqual({});
    expect(operations.updates).toEqual([1]);
  });

  it("他チームの行（読み取り専用）が送られてきても無視し、forbidden にせず何も書き込まない", async () => {
    mockSupabase([dbRow(1, "Aチーム"), dbRow(2, "Bチーム")]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム"),
      listRow(2, "Bチーム", { amount: 1 }),
    ]);

    expect(result).toEqual({});
    expect(operations.updates).toEqual([]);
  });

  it("他チームの行が画面表示後に削除・変更されていても、自チームの変更は保存できる", async () => {
    // Row 3 (Bチーム) was deleted by someone else: it is absent from the DB.
    mockSupabase([dbRow(1, "Aチーム"), dbRow(2, "Bチーム", 999)]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { amount: 200000 }),
      listRow(2, "Bチーム"),
      listRow(3, "Bチーム"),
    ]);

    expect(result).toEqual({});
    expect(operations.updates).toEqual([1]);
  });

  it("他チームの行にマスタ未登録の分類があっても、自チームの保存は検証で止まらない", async () => {
    mockSupabase([dbRow(1, "Aチーム"), dbRow(2, "Bチーム")]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { amount: 200000 }),
      listRow(2, "Bチーム", { category: "削除済み分類" }),
    ]);

    expect(result).toEqual({});
    expect(operations.updates).toEqual([1]);
  });

  it("自チームの行を他チームへ付け替える変更は forbidden", async () => {
    mockSupabase([dbRow(1, "Aチーム")]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Bチーム"),
    ]);

    expect(result.error?.kind).toBe("forbidden");
    expect(operations.updates).toEqual([]);
  });

  it("他チームの行の新規追加・削除は forbidden", async () => {
    mockSupabase([dbRow(2, "Bチーム")]);

    const added = await bulkSaveBudgetRecurringItems([
      listRow(10, "Bチーム", { isNew: true }),
    ]);
    const removed = await bulkSaveBudgetRecurringItems([
      listRow(2, "Bチーム", { isRemoved: true }),
    ]);

    expect(added.error?.kind).toBe("forbidden");
    expect(removed.error?.kind).toBe("forbidden");
    expect(operations.inserts).toEqual([]);
    expect(operations.deletes).toEqual([]);
  });

  it("所属チーム未設定の public は閲覧のみで、新規追加は forbidden", async () => {
    getAuthorizedViewer.mockResolvedValue({
      profileInfo: { id: 5, class: "public", is_teamleader: false, team: null },
    });
    mockSupabase([]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(10, "Aチーム", { isNew: true }),
    ]);

    expect(result.error?.kind).toBe("forbidden");
  });

  it("経理は全チームの行を保存できる", async () => {
    getAuthorizedViewer.mockResolvedValue({
      profileInfo: { id: 1, class: "accounting", team: null },
    });
    mockSupabase([dbRow(2, "Bチーム")]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(2, "Bチーム", { amount: 1 }),
    ]);

    expect(result).toEqual({});
    expect(operations.updates).toEqual([2]);
  });
});
