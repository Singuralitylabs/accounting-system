import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtraEntryInListType, ExtraEntryType } from "@/app/types/types";

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}));
vi.mock("@/app/utils/supabase/clients", () => ({ createServerSupabase }));

import { bulkUpsertExtraEntry } from "@/app/utils/supabase/extraEntries";

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

  it("保存前の確認の後に月が確定された（RPC が NOT_APPLIED / RLS 違反）場合は、何も保存されていないことを伝える", async () => {
    const september = saved(2, "2026-09-10");
    for (const rpcError of [
      { message: "NOT_APPLIED" },
      {
        message: 'new row violates row-level security policy for table "extra_entries"',
        code: "42501",
      },
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
