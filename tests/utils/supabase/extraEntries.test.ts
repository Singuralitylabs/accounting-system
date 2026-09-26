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

// supabase.from(table) のモック。select（保存前確認）と update / insert / delete を記録する
const setup = (closedMonths: string[], originals: ExtraEntryType[]) => {
  const writes: { op: string; payload?: unknown; id?: unknown }[] = [];
  const from = vi.fn((table: string) => {
    if (table === "profit_loss_closings") {
      return {
        select: () =>
          Promise.resolve({
            data: closedMonths.map((m) => ({ target_month: `${m}-01` })),
            error: null,
          }),
      };
    }
    return {
      select: () => ({
        in: () => Promise.resolve({ data: originals, error: null }),
      }),
      update: (payload: unknown) => ({
        eq: (_col: string, id: unknown) => {
          writes.push({ op: "update", payload, id });
          return Promise.resolve({ error: null });
        },
      }),
      insert: (payload: unknown) => {
        writes.push({ op: "insert", payload });
        return Promise.resolve({ error: null });
      },
      delete: () => ({
        in: (_col: string, id: unknown) => {
          writes.push({ op: "delete", id });
          return Promise.resolve({ error: null });
        },
      }),
    };
  });
  createServerSupabase.mockReturnValue({ from });
  return writes;
};

describe("bulkUpsertExtraEntry の確定済みの月の編集ロック（Issue #148）", () => {
  beforeEach(() => {
    createServerSupabase.mockReset();
  });

  it("確定済みの月の行を編集していなければ、他の月の行を保存でき、未変更の行は UPDATE しない", async () => {
    const august = saved(1, "2026-08-10");
    const september = saved(2, "2026-09-10");
    const writes = setup(["2026-08"], [august, september]);
    const result = await bulkUpsertExtraEntry([
      row(august), // 確定済みの月・未変更
      row({ ...september, billing_amount: 20000 }), // 未確定の月・変更あり
    ]);
    expect(result).toEqual({});
    expect(writes).toEqual([
      { op: "update", payload: expect.objectContaining({ billing_amount: 20000 }), id: 2 },
    ]);
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
      const writes = setup(["2026-08"], [august, september]);
      const result = await bulkUpsertExtraEntry(entries);
      expect(result.error?.kind).toBe("validationFailed");
      expect(result.error?.message).toContain("確定済みの月です");
      expect(writes).toEqual([]);
    }
  });
});
