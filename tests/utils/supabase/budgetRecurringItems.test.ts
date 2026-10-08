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


const mockSelectOnlySupabase = () => {
  const writes = vi.fn();
  createServerSupabase.mockReturnValue({
    from: () => ({
      select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
      insert: writes,
      update: writes,
      delete: writes,
    }),
  });
  return writes;
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

  it("マスタに無い分類は validationFailed を返し、何も書き込まない", async () => {
    const writes = mockSelectOnlySupabase();
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
    expect(writes).not.toHaveBeenCalled();
  });

  it("分類マスタの取得に失敗したら fetchFailed を返し、何も書き込まない", async () => {
    const writes = mockSelectOnlySupabase();
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
    expect(writes).not.toHaveBeenCalled();
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
        updated_at: "",
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
        updated_at: "",
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
        updated_at: "",
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
        updated_at: "",
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
      query.update = vi.fn((row: Record<string, unknown>) => {
        let id = 0;
        const chain = {
          eq: vi.fn((col: string, value: number) => {
            if (col === "id") id = value;
            return chain;
          }),
          select: vi.fn(() => {
            updates.push({ id, row });
            return Promise.resolve({ data: [{ id }], error: null });
          }),
        };
        return chain;
      });
      query.insert = vi.fn(() => Promise.resolve({ error: null }));
      query.delete = vi.fn(() => {
        const chain = {
          eq: vi.fn(() => chain),
          select: vi.fn(() => Promise.resolve({ data: [{ id: 0 }], error: null })),
        };
        return chain;
      });
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
  const dbRow = (
    id: number,
    team: string,
    amount = 100000,
    updated_at = "",
  ) => ({
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
    updated_at,
  });
  const listRow = (
    id: number,
    team: string,
    override: Partial<BudgetRecurringItemInListType> = {},
  ): BudgetRecurringItemInListType => ({ ...baseRow, id, team, ...override });

  const operations = {
    updates: [] as number[],
    inserts: [] as unknown[],
    deletes: [] as number[],
    eqCalls: [] as [string, unknown][][],
    concurrentUpdatedAt: {} as Record<number, string>,
    vanishedIds: [] as number[],
    inCalls: 0,
    recheckError: false,
  };

  const mockSupabase = (currentRows: ReturnType<typeof dbRow>[]) => {
    // Flips when the first write runs: rows in operations.vanishedIds existed at the pre-write check
    // but are gone by write time (and at the re-check after a 0-row write).
    let writeStarted = false;
    createServerSupabase.mockReturnValue({
      from: () => {
        const query: Record<string, unknown> = {};
        query.select = vi.fn(() => query);
        query.in = vi.fn((_col: string, ids: number[]) => {
          operations.inCalls += 1;
          // After a write has run, any further SELECT is the re-check of a 0-row write.
          if (writeStarted && operations.recheckError) {
            return Promise.resolve({ data: null, error: { message: "boom" } });
          }
          const data = currentRows.filter(
            (row) =>
              ids.includes(row.id) &&
              !(writeStarted && operations.vanishedIds.includes(row.id)),
          );
          return Promise.resolve({ data, error: null });
        });
        // Mimics PostgREST: the write matches a row only when every .eq() condition holds, so an
        // updated_at that differs from the row's value at write time matches nothing.
        const matchesAtWrite = (eqs: [string, unknown][]) => {
          const id = eqs.find(([col]) => col === "id")?.[1] as number;
          const sent = eqs.find(([col]) => col === "updated_at");
          if (operations.vanishedIds.includes(id)) return false;
          const atWrite =
            operations.concurrentUpdatedAt[id] ??
            currentRows.find((row) => row.id === id)?.updated_at;
          return !!sent && sent[1] === atWrite;
        };
        const writeChain = (kind: "updates" | "deletes") => {
          const eqs: [string, unknown][] = [];
          const chain = {
            eq: vi.fn((col: string, value: unknown) => {
              eqs.push([col, value]);
              return chain;
            }),
            select: vi.fn(() => {
              writeStarted = true;
              const id = eqs.find(([col]) => col === "id")?.[1] as number;
              operations.eqCalls.push(eqs);
              if (!matchesAtWrite(eqs)) {
                return Promise.resolve({ data: [], error: null });
              }
              operations[kind].push(id);
              return Promise.resolve({ data: [{ id }], error: null });
            }),
          };
          return chain;
        };
        query.update = vi.fn(() => writeChain("updates"));
        query.insert = vi.fn((rows: unknown) => {
          operations.inserts.push(rows);
          return Promise.resolve({ error: null });
        });
        query.delete = vi.fn(() => writeChain("deletes"));
        return query;
      },
    });
  };

  beforeEach(() => {
    operations.updates = [];
    operations.eqCalls = [];
    operations.concurrentUpdatedAt = {};
    operations.vanishedIds = [];
    operations.inCalls = 0;
    operations.recheckError = false;
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

  it("自チームの行を他チームへ付け替える変更は書き込まれない（UI では起きない。DB の RLS も拒否する）", async () => {
    mockSupabase([dbRow(1, "Aチーム")]);

    const result = await bulkSaveBudgetRecurringItems([listRow(1, "Bチーム")]);

    expect(result).toEqual({});
    expect(operations.updates).toEqual([]);
  });

  it("画面表示後に他チームから自チームへ付け替えられた行を、旧チームのまま送ってきても forbidden にしない", async () => {
    // Row 2 was Bチーム when displayed (read-only) and now belongs to Aチーム (updated_at moved).
    mockSupabase([dbRow(1, "Aチーム"), dbRow(2, "Aチーム", 100000, "t2")]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { amount: 200000 }),
      listRow(2, "Bチーム"),
    ]);

    expect(result).toEqual({});
    expect(operations.updates).toEqual([1]);
  });

  it("画面表示後に自チームの行が他チームへ付け替えられ、その行を編集していたら、黙って捨てず再読み込みを促す", async () => {
    mockSupabase([dbRow(1, "Bチーム", 100000, "t2")]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { amount: 200000, isEdited: true }),
    ]);

    expect(result.error?.kind).toBe("validationFailed");
    expect(result.error?.message).toContain("再読み込み");
    expect(operations.updates).toEqual([]);
  });

  it("触っていない自チームの行が他チームへ付け替えられ、担当者や金額も変えられていても、別の行の保存は競合にしない", async () => {
    mockSupabase([
      dbRow(1, "Aチーム"),
      { ...dbRow(2, "Bチーム", 999999, "t2"), manager_id: 7 as never },
    ]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { amount: 200000, isEdited: true }),
      listRow(2, "Aチーム"),
    ]);

    expect(result).toEqual({});
    expect(operations.updates).toEqual([1]);
  });

  it("触っていない自チームの行が他のユーザーに更新されていても、表示時の古い値で上書きしない", async () => {
    // Row 2 amount was changed from 100000 to 120000 by someone else after display.
    mockSupabase([dbRow(1, "Aチーム"), dbRow(2, "Aチーム", 120000, "t2")]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { amount: 200000, isEdited: true }),
      listRow(2, "Aチーム"),
    ]);

    expect(result).toEqual({});
    expect(operations.updates).toEqual([1]);
  });

  it("自分が編集した行が他のユーザーにも更新されていたら、上書きせず再読み込みを促す", async () => {
    mockSupabase([dbRow(1, "Aチーム", 120000, "t2")]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { amount: 200000, isEdited: true }),
    ]);

    expect(result.error?.kind).toBe("validationFailed");
    expect(operations.updates).toEqual([]);
  });

  it("画面表示後に自チームから他チームへ付け替えられた行を削除しようとしたら、成功扱いにせず再読み込みを促す", async () => {
    mockSupabase([dbRow(1, "Bチーム", 100000, "t2")]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { isRemoved: true }),
    ]);

    expect(result.error?.kind).toBe("validationFailed");
    expect(result.error?.message).toContain("再読み込み");
    expect(operations.deletes).toEqual([]);
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

  it("担当者の存在確認は実際に書き込む行だけが対象で、他チーム・変更のない行・無視される行の担当者は含めない", async () => {
    mockSupabase([
      dbRow(1, "Aチーム"),
      { ...dbRow(2, "Aチーム"), manager_id: 99 as never, display_order: 1 },
      { ...dbRow(3, "Aチーム", 100000, "t2"), manager_id: 98 as never },
      { ...dbRow(4, "Bチーム"), manager_id: 97 as never },
    ]);

    await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { amount: 200000, manager_id: 10, isEdited: true }),
      // Unchanged own row whose manager was removed.
      listRow(2, "Aチーム", { manager_id: 99 }),
      // Untouched own row that someone else changed since display (ignored).
      listRow(3, "Aチーム", { manager_id: 98 }),
      // Another team's row.
      listRow(4, "Bチーム", { manager_id: 97 }),
    ]);

    expect(assertManagerIdsExist).toHaveBeenCalledWith(
      [10],
      expect.any(String),
      expect.any(String),
    );
  });

  it("自分が編集した行が、表示後に他のユーザーに削除されていたら、成功扱いにせず再読み込みを促す", async () => {
    mockSupabase([]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { amount: 200000, isEdited: true }),
    ]);

    expect(result.error?.kind).toBe("validationFailed");
    expect(result.error?.message).toContain("再読み込み");
    expect(operations.updates).toEqual([]);
  });

  it("触っていない行が表示後に他のユーザーに削除されていても、別の行の保存は止まらない", async () => {
    mockSupabase([dbRow(1, "Aチーム")]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { amount: 200000, isEdited: true }),
      listRow(2, "Aチーム"),
    ]);

    expect(result).toEqual({});
    expect(operations.updates).toEqual([1]);
  });

  it("表示後に他のユーザーが内容を直した行を削除しようとしたら、確認なしに削除せず再読み込みを促す", async () => {
    mockSupabase([dbRow(1, "Aチーム", 120000, "t2")]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { isRemoved: true }),
    ]);

    expect(result.error?.kind).toBe("validationFailed");
    expect(operations.deletes).toEqual([]);
  });

  it("UPDATE は id と、表示時の updated_at の両方を条件にする", async () => {
    mockSupabase([dbRow(2, "Aチーム", 100000, "t1")]);

    await bulkSaveBudgetRecurringItems([
      listRow(2, "Aチーム", { amount: 300000, isEdited: true, updated_at: "t1" }),
    ]);

    expect(operations.eqCalls).toEqual([
      [
        ["id", 2],
        ["updated_at", "t1"],
      ],
    ]);
  });

  it("確認から UPDATE までの間に他のユーザーが同じ行を保存していたら（updated_at が変わる）、上書きせず一部未保存として報告する", async () => {
    mockSupabase([dbRow(1, "Aチーム"), dbRow(2, "Aチーム")]);
    operations.concurrentUpdatedAt = { 2: "t3" };

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { amount: 200000, isEdited: true }),
      listRow(2, "Aチーム", { amount: 300000, isEdited: true }),
    ]);

    expect(result.error?.kind).toBe("partialWriteFailed");
    expect(result.error?.message).toContain("他のユーザー");
    expect(operations.updates).toEqual([1]);
  });

  it("確認後に他のユーザーが変えた、触っていない行（display_order の再採番だけ）の UPDATE が 0 行でも報告しない", async () => {
    // Deleting row 1 renumbers row 2 (display_order 1 -> 0), so row 2 is in the update list untouched.
    mockSupabase([
      dbRow(1, "Aチーム"),
      { ...dbRow(2, "Aチーム"), display_order: 1 },
    ]);
    operations.concurrentUpdatedAt = { 2: "t3" };

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { isRemoved: true }),
      listRow(2, "Aチーム"),
    ]);

    expect(result).toEqual({});
    expect(operations.deletes).toEqual([1]);
    expect(operations.updates).toEqual([]);
  });

  it("DELETE も id と updated_at を条件にし、確認後に他のユーザーが直した行は削除せず報告する", async () => {
    mockSupabase([dbRow(1, "Aチーム")]);
    operations.concurrentUpdatedAt = { 1: "t3" };

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { isRemoved: true }),
    ]);

    expect(operations.eqCalls).toEqual([
      [
        ["id", 1],
        ["updated_at", ""],
      ],
    ]);
    expect(result.error?.kind).toBe("partialWriteFailed");
    expect(operations.deletes).toEqual([]);
  });

  it("確認と削除の間に他のユーザーが同じ行を削除していたら（目的どおり消えている）、報告せず成功扱いにする", async () => {
    mockSupabase([dbRow(1, "Aチーム"), dbRow(2, "Aチーム")]);
    operations.vanishedIds = [1];

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { isRemoved: true }),
      listRow(2, "Aチーム"),
    ]);

    expect(result).toEqual({});
    expect(operations.deletes).toEqual([]);
    // The pre-write check plus the re-check after the 0-row DELETE.
    expect(operations.inCalls).toBe(2);
  });

  it("0 行だった削除の再確認が失敗したら、行が残っているものとして報告し、ログに残す", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSupabase([dbRow(1, "Aチーム")]);
    operations.vanishedIds = [1];
    operations.recheckError = true;

    try {
      const result = await bulkSaveBudgetRecurringItems([
        listRow(1, "Aチーム", { isRemoved: true }),
      ]);

      expect(result.error?.kind).toBe("partialWriteFailed");
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("再確認に失敗"),
        expect.anything(),
      );
    } finally {
      // Restore even when an assertion fails, so later tests keep their console.error output.
      errorSpy.mockRestore();
    }
  });

  it("表示後に他のユーザーが既に削除した行は、削除対象にせず成功扱いにする", async () => {
    mockSupabase([dbRow(2, "Aチーム")]);

    const result = await bulkSaveBudgetRecurringItems([
      listRow(1, "Aチーム", { isRemoved: true }),
      listRow(2, "Aチーム"),
    ]);

    expect(result).toEqual({});
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
