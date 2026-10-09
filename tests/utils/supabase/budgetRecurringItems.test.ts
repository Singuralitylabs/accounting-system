import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabase,
  getLoggedInViewer,
  assertManagerIdsExist,
  getActiveSelectOptionsByType,
} = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  getLoggedInViewer: vi.fn(),
  assertManagerIdsExist: vi.fn(),
  getActiveSelectOptionsByType: vi.fn(),
}));

vi.mock("@/app/utils/supabase/clients", () => ({ createServerSupabase }));
vi.mock("@/app/utils/supabase/viewerAccess", () => ({
  getLoggedInViewer: getLoggedInViewer,
}));
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


const mockRpcSupabase = (rpcResult: { error: unknown } = { error: null }) => {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  createServerSupabase.mockReturnValue({ rpc });
  return rpc;
};

const setupMocks = (viewer: Record<string, unknown>) => {
  createServerSupabase.mockReset();
  getLoggedInViewer.mockReset();
  getLoggedInViewer.mockResolvedValue({ profileInfo: viewer });
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
};

const sentRows = (rpc: ReturnType<typeof vi.fn>) =>
  rpc.mock.calls[0][1].p_rows as Record<string, unknown>[];

describe("bulkSaveBudgetRecurringItems の分類マスタ照合（Issue #116）", () => {
  beforeEach(() => {
    setupMocks({ id: 1, class: "accounting", team: null });
  });

  it("マスタに無い分類は validationFailed を返し、何も書き込まない", async () => {
    const rpc = mockRpcSupabase();
    const result = await bulkSaveBudgetRecurringItems([
      { ...baseRow, category: "旧品目", isEdited: true },
    ]);

    expect(result).toEqual({
      error: {
        kind: "validationFailed",
        message:
          "選択された分類がマスタに登録されていません。画面を再読み込みして選び直してください。",
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("分類マスタの取得に失敗したら fetchFailed を返し、何も書き込まない", async () => {
    const rpc = mockRpcSupabase();
    getActiveSelectOptionsByType.mockResolvedValue({
      optionsByType: {},
      error: new Error("master fetch failed"),
    });

    const result = await bulkSaveBudgetRecurringItems([
      { ...baseRow, isEdited: true },
    ]);

    expect(result).toEqual({
      error: {
        kind: "fetchFailed",
        message: "事前収支申告の定期明細の分類確認に失敗しました。",
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("bulkSaveBudgetRecurringItems の RPC 呼び出し（Issue #251）", () => {
  beforeEach(() => {
    setupMocks({ id: 1, class: "accounting", team: null });
  });

  const teamRow = (
    id: number,
    team: string,
    override: Partial<BudgetRecurringItemInListType> = {},
  ): BudgetRecurringItemInListType => ({
    ...baseRow,
    id,
    team,
    updated_at: `2026-10-0${id}T00:00:00+00:00`,
    ...override,
  });

  it("書き込みは save_budget_recurring_items を 1 回だけ呼び、新規・編集・削除を状態付きで渡す", async () => {
    const rpc = mockRpcSupabase();
    const result = await bulkSaveBudgetRecurringItems([
      teamRow(1, "Aチーム", { isEdited: true, amount: 200000 }),
      teamRow(2, "Aチーム", { isRemoved: true }),
      teamRow(0, "Aチーム", { isNew: true, description: "  新規  " }),
    ]);

    expect(result).toEqual({});
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("save_budget_recurring_items");
    const rows = sentRows(rpc);
    expect(rows.map((row) => [row.state, row.id])).toEqual([
      ["edited", 1],
      ["removed", 2],
      ["new", 0],
    ]);
    expect(rows[0]).toMatchObject({
      amount: 200000,
      updated_at: "2026-10-01T00:00:00+00:00",
      display_order: 0,
    });
    expect(rows[2]).toMatchObject({ description: "新規", display_order: 1 });
  });

  it("新規行の updated_at（画面では空文字）は null で送る（timestamptz に変換できない値を RPC に渡さない）", async () => {
    const rpc = mockRpcSupabase();
    await bulkSaveBudgetRecurringItems([
      teamRow(0, "Aチーム", { isNew: true, updated_at: "" }),
    ]);

    expect(sentRows(rpc)[0]).toMatchObject({ state: "new", updated_at: null });
  });

  it("編集・削除・並べ替えの行は、画面で見た updated_at をそのまま送る（競合検出に使う）", async () => {
    const rpc = mockRpcSupabase();
    await bulkSaveBudgetRecurringItems([
      teamRow(1, "Aチーム", { isEdited: true, amount: 200000 }),
      teamRow(2, "Aチーム", { isRemoved: true }),
      teamRow(3, "Aチーム", { display_order: 9 }),
    ]);

    expect(sentRows(rpc).map((row) => [row.state, row.updated_at])).toEqual([
      ["edited", "2026-10-01T00:00:00+00:00"],
      ["removed", "2026-10-02T00:00:00+00:00"],
      ["keep", "2026-10-03T00:00:00+00:00"],
    ]);
  });

  it("追加してすぐ削除した行は送らない", async () => {
    const rpc = mockRpcSupabase();
    await bulkSaveBudgetRecurringItems([
      teamRow(0, "Aチーム", { isNew: true, isRemoved: true }),
      teamRow(1, "Aチーム", { isEdited: true }),
    ]);

    expect(sentRows(rpc).map((row) => row.state)).toEqual(["edited"]);
  });

  it("変更する行が無ければ RPC を呼ばず成功を返す", async () => {
    const rpc = mockRpcSupabase();
    const result = await bulkSaveBudgetRecurringItems([
      teamRow(1, "Aチーム", { display_order: 0 }),
    ]);

    expect(result).toEqual({});
    expect(rpc).not.toHaveBeenCalled();
  });

  it("display_order をチームごとに 0 から採番し、順序が変わった触っていない行だけ keep で送る", async () => {
    const rpc = mockRpcSupabase();
    await bulkSaveBudgetRecurringItems([
      teamRow(1, "Aチーム", { display_order: 0 }),
      teamRow(2, "Aチーム", { display_order: 5 }),
      teamRow(3, "Bチーム", { display_order: 0 }),
      teamRow(4, "Bチーム", { display_order: 1, isEdited: true, amount: 1 }),
    ]);

    const rows = sentRows(rpc);
    // Numbering across all teams would also rewrite team B's untouched row 3; per team only row 2
    // (renumbered 5 -> 1) and the edited row 4 are sent.
    expect(rows.map((row) => [row.state, row.id, row.display_order])).toEqual([
      ["keep", 2, 1],
      ["edited", 4, 1],
    ]);
  });

  it("担当者の存在確認は新規・編集した行だけが対象", async () => {
    const rpc = mockRpcSupabase();
    await bulkSaveBudgetRecurringItems([
      teamRow(1, "Aチーム", { manager_id: 10, isEdited: true }),
      teamRow(2, "Aチーム", { manager_id: 20, display_order: 7 }),
      teamRow(3, "Aチーム", { manager_id: 30, isRemoved: true }),
    ]);

    expect(rpc).toHaveBeenCalled();
    expect(assertManagerIdsExist).toHaveBeenCalledWith(
      [10],
      expect.any(String),
      expect.any(String),
    );
  });

  it("担当者が存在しなければ RPC を呼ばない", async () => {
    const rpc = mockRpcSupabase();
    const failure = { kind: "validationFailed", message: "担当者がいません" };
    assertManagerIdsExist.mockResolvedValue(failure);

    const result = await bulkSaveBudgetRecurringItems([
      teamRow(1, "Aチーム", { manager_id: 10, isEdited: true }),
    ]);

    expect(result).toEqual({ error: failure });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("競合（BUDGET_RECURRING_ITEMS_CONFLICT）は何も保存されていない旨の validationFailed を返す", async () => {
    mockRpcSupabase({
      error: { code: "40001", message: "BUDGET_RECURRING_ITEMS_CONFLICT" },
    });

    const result = await bulkSaveBudgetRecurringItems([
      teamRow(1, "Aチーム", { isEdited: true }),
    ]);

    expect(result.error?.kind).toBe("validationFailed");
    expect(result.error?.message).toContain("何も保存されていません");
    expect(result.error?.message).toContain("再読み込み");
  });

  it("権限エラー（42501）は forbidden を返す", async () => {
    mockRpcSupabase({ error: { code: "42501", message: "permission denied" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await bulkSaveBudgetRecurringItems([
      teamRow(1, "Aチーム", { isEdited: true }),
    ]);

    expect(result.error?.kind).toBe("forbidden");
    errorSpy.mockRestore();
  });

  it("SQLSTATE の無い通信エラーは書き込み済みの可能性があるため、kind を付けずに throw する", async () => {
    mockRpcSupabase({ error: { code: "", message: "TypeError: fetch failed" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      bulkSaveBudgetRecurringItems([teamRow(1, "Aチーム", { isEdited: true })]),
    ).rejects.toThrow("更新結果を確認できませんでした");
    errorSpy.mockRestore();
  });

  it("その他の RPC エラーは partialWriteFailed にせず、何も保存されていない fetchFailed を返す", async () => {
    mockRpcSupabase({ error: { code: "XX000", message: "boom" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await bulkSaveBudgetRecurringItems([
      teamRow(1, "Aチーム", { isEdited: true }),
    ]);

    expect(result.error?.kind).toBe("fetchFailed");
    expect(result.error?.message).toContain("何も保存されていません");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("bulkSaveBudgetRecurringItems の書き込みチーム判定（Issue #245）", () => {
  const teamRow = (
    id: number,
    team: string,
    override: Partial<BudgetRecurringItemInListType> = {},
  ): BudgetRecurringItemInListType => ({
    ...baseRow,
    id,
    team,
    ...override,
  });

  beforeEach(() => {
    setupMocks({ id: 1, class: "public", team: "Aチーム", is_teamleader: false });
  });

  it("閲覧はログイン済みなら誰でも可能なため、ロールでの絞り込みなしで確認する", async () => {
    mockRpcSupabase();
    await bulkSaveBudgetRecurringItems([]);

    expect(getLoggedInViewer).toHaveBeenCalledWith(expect.any(String));
  });

  it("他チームの行（読み取り専用）が編集済み・未編集で送られてきても無視し、forbidden にせず何も書き込まない", async () => {
    const rpc = mockRpcSupabase();
    const result = await bulkSaveBudgetRecurringItems([
      teamRow(1, "Bチーム", { isEdited: true, display_order: 9 }),
      teamRow(2, "Bチーム", { display_order: 9 }),
    ]);

    expect(result).toEqual({});
    expect(rpc).not.toHaveBeenCalled();
  });

  it("他チームの行にマスタ未登録の分類があっても、自チームの保存は検証で止まらない", async () => {
    const rpc = mockRpcSupabase();
    const result = await bulkSaveBudgetRecurringItems([
      teamRow(1, "Bチーム", { category: "旧品目" }),
      teamRow(2, "Aチーム", { isEdited: true }),
    ]);

    expect(result).toEqual({});
    expect(sentRows(rpc).map((row) => row.id)).toEqual([2]);
  });

  it("他チームの行の新規追加・削除は forbidden で、何も書き込まない", async () => {
    const rpc = mockRpcSupabase();

    const added = await bulkSaveBudgetRecurringItems([
      teamRow(0, "Bチーム", { isNew: true }),
    ]);
    const removed = await bulkSaveBudgetRecurringItems([
      teamRow(1, "Bチーム", { isRemoved: true }),
    ]);

    expect(added.error).toEqual({
      kind: "forbidden",
      message: "Bチームの事前収支申告の定期明細を編集する権限がありません。",
    });
    expect(removed.error?.kind).toBe("forbidden");
    expect(rpc).not.toHaveBeenCalled();
    expect(getActiveSelectOptionsByType).not.toHaveBeenCalled();
    expect(assertManagerIdsExist).not.toHaveBeenCalled();
  });

  it("自チームの行を他チームへ付け替える変更は書き込まない（事前チェックでは自チーム扱いにならず無視される。DB の RLS も拒否する）", async () => {
    const rpc = mockRpcSupabase();
    const result = await bulkSaveBudgetRecurringItems([
      teamRow(1, "Bチーム", { isEdited: true }),
    ]);

    expect(result).toEqual({});
    expect(rpc).not.toHaveBeenCalled();
  });

  it("所属チーム未設定の public は閲覧のみで、新規追加は forbidden", async () => {
    setupMocks({ id: 2, class: "public", team: null, is_teamleader: false });
    const rpc = mockRpcSupabase();

    const result = await bulkSaveBudgetRecurringItems([
      teamRow(0, "Aチーム", { isNew: true }),
    ]);

    expect(result.error?.kind).toBe("forbidden");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("所属チームのある public は、他チームの変更していない行が含まれていても自チームの変更を保存できる", async () => {
    const rpc = mockRpcSupabase();
    const result = await bulkSaveBudgetRecurringItems([
      teamRow(1, "Aチーム", { isEdited: true }),
      teamRow(2, "Bチーム"),
    ]);

    expect(result).toEqual({});
    expect(sentRows(rpc).map((row) => row.id)).toEqual([1]);
  });

  it("経理は全チームの行を保存できる", async () => {
    setupMocks({ id: 3, class: "accounting", team: null, is_teamleader: false });
    const rpc = mockRpcSupabase();

    const result = await bulkSaveBudgetRecurringItems([
      teamRow(1, "Aチーム", { isEdited: true }),
      teamRow(2, "Bチーム", { isEdited: true }),
    ]);

    expect(result).toEqual({});
    expect(sentRows(rpc).map((row) => row.id)).toEqual([1, 2]);
  });
});
