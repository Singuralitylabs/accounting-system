import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtraEntryInListType, ExtraEntryType } from "@/app/types/types";

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}));
vi.mock("@/app/utils/supabase/clients", () => ({ createServerSupabase }));

import { bulkUpsertExtraEntry } from "@/app/utils/supabase/extraEntries";
import { copyExtraEntriesFromPreviousMonth } from "@/app/utils/supabase/extraEntries";
import { getExtraEntryList } from "@/app/utils/supabase/extraEntries";

const saved = (
  id: number,
  entryDate: string | null,
  override: Partial<ExtraEntryType> = {},
): ExtraEntryType => ({
  id,
  entry_type: "income",
  category: "協賛金",
  entry_date: entryDate,
  invoice_number: null,
  description: `経理追加${id}`,
  billing_target: null,
  manager_id: 1,
  team: null,
  billing_amount: 10000,
  expense_amount: null,
  payment_method: null,
  inserted_at: "",
  updated_at: "",
  ...override,
});
const row = (
  entry: ExtraEntryType,
  flags: Partial<ExtraEntryInListType> = {},
): ExtraEntryInListType => ({
  ...entry,
  isNew: false,
  isRemoved: false,
  ...flags,
});

// supabase のモック。from（保存前確認の select）と rpc（save_extra_entries）を記録する
type RpcArgs = {
  p_inserts: Record<string, unknown>[];
  p_updates: Record<string, unknown>[];
  p_delete_ids: number[];
};
const setup = (
  closedMonths: string[],
  originals: ExtraEntryType[],
  rpcError: { message: string; code?: string } | null = null,
) => {
  const calls: RpcArgs[] = [];
  const from = vi.fn((table: string) => {
    if (table === "profit_loss_closings") {
      return {
        select: () => ({
          order: () =>
            Promise.resolve({
              data: closedMonths.map((m) => ({ target_month: `${m}-01` })),
              error: null,
            }),
        }),
      };
    }
    // extra_entries の保存前確認（id 指定・ページング）
    const query = {
      select: () => query,
      in: () => query,
      gt: () => query,
      order: () => query,
      limit: () => Promise.resolve({ data: originals, error: null }),
    };
    return query;
  });
  const rpc = vi.fn((name: string, args: RpcArgs) => {
    expect(name).toBe("save_extra_entries");
    calls.push(args);
    return Promise.resolve({ data: null, error: rpcError });
  });
  createServerSupabase.mockReturnValue({ from, rpc });
  return calls;
};

describe("bulkUpsertExtraEntry（確定済みの月の編集ロック・1 トランザクションの保存）", () => {
  beforeEach(() => {
    createServerSupabase.mockReset();
  });

  it("追加・更新・削除を 1 回の save_extra_entries にまとめる（確定済みの月の行を送らなければ他の月は保存できる）", async () => {
    const august = saved(1, "2026-08-10");
    const september = saved(2, "2026-09-10");
    const october = saved(4, "2026-10-10");
    const calls = setup(["2026-08"], [august, september, october]);
    // 画面は追加・削除・編集した行だけを送る（selectChangedExtraEntries）
    const result = await bulkUpsertExtraEntry([
      row({ ...september, billing_amount: 20000 }),
      row(saved(3, "2026-09-01"), { isNew: true }),
      row(october, { isRemoved: true }),
    ]);
    expect(result).toEqual({});
    expect(calls).toHaveLength(1);
    expect(calls[0].p_updates).toEqual([
      expect.objectContaining({ id: 2, billing_amount: 20000 }),
    ]);
    expect(calls[0].p_inserts).toEqual([
      expect.objectContaining({ description: "経理追加3" }),
    ]);
    expect(calls[0].p_inserts[0]).not.toHaveProperty("id");
    expect(calls[0].p_delete_ids).toEqual([4]);
  });

  it("編集した行が読み込み後に他の利用者に削除されていたら、何も書き込まずに再読み込みを促す", async () => {
    const september = saved(2, "2026-09-10");
    // DB には id 2 が無い
    const calls = setup([], []);
    const result = await bulkUpsertExtraEntry([
      row(saved(10, "2026-09-01"), { isNew: true }),
      row({ ...september, billing_amount: 1 }),
    ]);
    expect(result.error?.kind).toBe("validationFailed");
    expect(result.error?.message).toContain("他の利用者に削除された行");
    expect(result.error?.message).toContain("経理追加2");
    expect(calls).toEqual([]); // 追加も含めて何も書き込まない
  });

  it("削除した行が既に削除されていた場合は、その削除だけを省いて他の行を保存する", async () => {
    const september = saved(2, "2026-09-10");
    const calls = setup([], [september]);
    const result = await bulkUpsertExtraEntry([
      row(saved(3, "2026-09-10"), { isRemoved: true }), // DB に無い
      row(september, { isRemoved: true }),
    ]);
    expect(result).toEqual({});
    expect(calls[0].p_delete_ids).toEqual([2]);
    // すべて既に削除済みなら RPC を呼ばない
    const none = setup([], []);
    expect(
      await bulkUpsertExtraEntry([row(september, { isRemoved: true })]),
    ).toEqual({});
    expect(none).toEqual([]);
  });

  it("保存前の確認の後に月が確定された（RPC が NOT_APPLIED / RLS 違反 / 確定との直列化で MONTH_CLOSED）場合は、何も保存されていないことを伝える", async () => {
    const september = saved(2, "2026-09-10");
    for (const rpcError of [
      { message: "NOT_APPLIED" },
      {
        message: 'new row violates row-level security policy for table "extra_entries"',
        code: "42501",
      },
      // 書き込みのトリガー（Issue #171）
      { message: "MONTH_CLOSED", code: "42501" },
    ]) {
      setup([], [september], rpcError);
      const result = await bulkUpsertExtraEntry([
        row({ ...september, billing_amount: 1 }),
      ]);
      expect(result.error?.kind).toBe("validationFailed");
      expect(result.error?.message).toContain("何も保存しませんでした");
    }
    // それ以外の失敗も例外にせず、何も保存されていないことを返す
    setup([], [september], { message: "boom" });
    const failed = await bulkUpsertExtraEntry([
      row({ ...september, billing_amount: 1 }),
    ]);
    expect(failed.error?.kind).toBe("fetchFailed");
    expect(failed.error?.message).toContain("何も保存されていません");
  });

  it("確定済みの月の行を変更・削除・確定済みの月へ移動しようとすると、何も書き込まずにエラーを返す", async () => {
    const august = saved(1, "2026-08-10");
    const september = saved(2, "2026-09-10");
    for (const entries of [
      [row({ ...august, description: "変更" })],
      [row(august, { isRemoved: true })],
      [row({ ...september, entry_date: "2026-08-31" })],
      [row(saved(3, "2026-08-01"), { isNew: true })],
    ]) {
      const calls = setup(["2026-08"], [august, september]);
      const result = await bulkUpsertExtraEntry(entries);
      expect(result.error?.kind).toBe("validationFailed");
      expect(result.error?.message).toContain("確定済みの月です");
      expect(calls).toEqual([]);
    }
  });
});

describe("copyExtraEntriesFromPreviousMonth の対象月検証（Issue #140）", () => {
  beforeEach(() => {
    createServerSupabase.mockReset();
  });

  it("不正な targetMonth は DB に行かずエラーを返す", async () => {
    const result = await copyExtraEntriesFromPreviousMonth([1, 2], "2026-09-15");

    expect(result.insertedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(result.error).toBeTruthy();
    expect(createServerSupabase).not.toHaveBeenCalled();
  });

  it("空の sourceIds は正常（DB に行かない）", async () => {
    const result = await copyExtraEntriesFromPreviousMonth([], "2026-09");

    expect(result).toEqual({ insertedCount: 0, skippedCount: 0, error: null });
    expect(createServerSupabase).not.toHaveBeenCalled();
  });
});

describe("copyExtraEntriesFromPreviousMonth の確定済みの月（Issue #148 / #171）", () => {
  beforeEach(() => {
    createServerSupabase.mockReset();
  });

  // 確定済みの月の取得・複製元（前月）の取得・当月の既存行の取得・INSERT を模す
  const setupCopy = (
    closedMonths: string[],
    insertError: { message: string; code?: string } | null,
  ) => {
    const inserted: unknown[] = [];
    const august = saved(1, "2026-08-10");
    const from = vi.fn((table: string) => {
      if (table === "profit_loss_closings") {
        return {
          select: () => ({
            order: () =>
              Promise.resolve({
                data: closedMonths.map((m) => ({ target_month: `${m}-01` })),
                error: null,
              }),
          }),
        };
      }
      // extra_entries: 1 回目は複製元（in + gte + lt）、2 回目は当月の既存行（gte + lt）
      const query = {
        select: () => query,
        in: () => query,
        gte: () => query,
        lt: (_column: string, value: string) =>
          Promise.resolve({
            data: value === "2026-09-01" ? [august] : [],
            error: null,
          }),
        insert: (rows: unknown[]) => {
          inserted.push(...rows);
          return Promise.resolve({ error: insertError });
        },
      };
      return query;
    });
    createServerSupabase.mockReturnValue({ from });
    return inserted;
  };

  it("確定済みの月へのコピーは書き込まずに確定済みのエラーを返す", async () => {
    const inserted = setupCopy(["2026-09"], null);
    const result = await copyExtraEntriesFromPreviousMonth([1], "2026-09");
    expect(result.closedMonthError).toContain("確定済みの月です");
    expect(inserted).toEqual([]);
  });

  it("確認の後に対象月が確定された（INSERT が MONTH_CLOSED）場合も、確定済みのエラーを返す", async () => {
    const inserted = setupCopy([], { message: "MONTH_CLOSED", code: "42501" });
    const result = await copyExtraEntriesFromPreviousMonth([1], "2026-09");
    expect(inserted).toHaveLength(1);
    expect(result).toEqual({
      insertedCount: 0,
      skippedCount: 0,
      error: null,
      closedMonthError: expect.stringContaining("確定済みの月です"),
    });
  });

  it("それ以外の INSERT の失敗はエラーとして返す", async () => {
    const insertError = { message: "boom" };
    setupCopy([], insertError);
    const result = await copyExtraEntriesFromPreviousMonth([1], "2026-09");
    expect(result.error).toBe(insertError);
    expect(result.closedMonthError).toBeUndefined();
  });

  it("未確定の月へは複製した行を追加する", async () => {
    const inserted = setupCopy([], null);
    const result = await copyExtraEntriesFromPreviousMonth([1], "2026-09");
    expect(result).toEqual({ insertedCount: 1, skippedCount: 0, error: null });
    expect(inserted).toEqual([
      expect.objectContaining({ entry_date: "2026-09-10" }),
    ]);
  });
});

describe("getExtraEntryList の月条件（Issue #157）", () => {
  beforeEach(() => {
    createServerSupabase.mockReset();
  });

  // 対象月の範囲内 OR 月未確定（NULL）の絞り込み条件が付くことを検証する
  const setupList = () => {
    let orCondition = "";
    const terminal = Promise.resolve({ data: [], error: null });
    const secondOrder = { order: () => terminal };
    const firstOrder = { order: () => secondOrder };
    const query = {
      select: () => query,
      or: (condition: string) => {
        orCondition = condition;
        return firstOrder;
      },
    };
    createServerSupabase.mockReturnValue({
      from: () => query,
    });
    return () => orCondition;
  };

  it("対象月の期間内 OR NULL で絞る（損益計算書の選択月の明細と同じ範囲）", async () => {
    const getOrCondition = setupList();

    const result = await getExtraEntryList("2026-09");

    expect(result.error).toBeNull();
    expect(getOrCondition()).toBe(
      "and(entry_date.gte.2026-09-01,entry_date.lt.2026-10-01),entry_date.is.null",
    );
  });

  it("不正な月キーは DB に行かずエラーを返す", async () => {
    const result = await getExtraEntryList("2026-09-15");

    expect(result.extraEntryList).toBeNull();
    expect(result.error).toBeTruthy();
    expect(createServerSupabase).not.toHaveBeenCalled();
  });
});
