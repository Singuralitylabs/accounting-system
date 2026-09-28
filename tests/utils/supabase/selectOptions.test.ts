import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}));

vi.mock("@/app/utils/supabase/clients", () => ({ createServerSupabase }));
// bulkUpsertSelectOptions は参照しないが、react cache をテスト環境に持ち込まないためモックする
vi.mock("@/app/utils/supabase/selectOptionsCache", () => ({
  getActiveSelectOptionsByType: vi.fn(),
}));

import { bulkUpsertSelectOptions } from "@/app/utils/supabase/selectOptions";

// select_option_types の取得・select_options の INSERT（1 行ずつ）・UPDATE を記録する
// Supabase クライアントのモック
const createSupabaseMock = ({
  failInsertAt,
  failUpdate = false,
}: { failInsertAt?: number; failUpdate?: boolean } = {}) => {
  const inserted: Record<string, unknown>[] = [];
  const updated: { id: number; values: Record<string, unknown> }[] = [];
  let nextId = 100;

  const from = vi.fn((table: string) => {
    if (table === "select_option_types") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: "type-team" }, error: null }),
          }),
        }),
      };
    }
    return {
      insert: (values: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            if (failInsertAt === inserted.length) {
              return { data: null, error: { message: "insert failed" } };
            }
            inserted.push(values);
            return { data: { id: nextId++ }, error: null };
          },
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async (_column: string, id: number) => {
          updated.push({ id, values });
          return { error: failUpdate ? { message: "update failed" } : null };
        },
      }),
    };
  });

  return { client: { from }, inserted, updated };
};

const option = (
  id: number,
  value: string,
  overrides: { is_active?: boolean; isNew?: boolean } = {},
) => ({
  id,
  value,
  display_order: Math.abs(id),
  is_active: true,
  isNew: false,
  ...overrides,
});

describe("bulkUpsertSelectOptions", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("追加した行を 1 行ずつ INSERT し、画面上の仮 id と DB の id の対応を返す", async () => {
    const { client, inserted, updated } = createSupabaseMock();
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "チームA"),
      option(-1, "チームB", { isNew: true }),
      option(-2, "チームC", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [
        { tempId: -1, id: 100 },
        { tempId: -2, id: 101 },
      ],
    });
    expect(inserted.map((row) => row.value)).toEqual(["チームB", "チームC"]);
    expect(inserted[0]).toMatchObject({ type_id: "type-team", is_active: true });
    expect(updated.map((row) => row.id)).toEqual([1]);
  });

  it("追加してすぐ削除した行は送らず、保存済みの行の削除は無効化（UPDATE）する", async () => {
    const { client, inserted, updated } = createSupabaseMock();
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(100, "チームB", { is_active: false }),
      option(-1, "取り消し", { isNew: true, is_active: false }),
    ]);

    expect(result).toEqual({ insertedIds: [] });
    expect(inserted).toEqual([]);
    expect(updated).toEqual([
      { id: 100, values: expect.objectContaining({ is_active: false }) },
    ]);
  });

  it("INSERT が途中で失敗したら、それまでに INSERT できた行の対応とエラーを返す（例外にしない）", async () => {
    const { client, inserted, updated } = createSupabaseMock({
      failInsertAt: 1,
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "チームA"),
      option(-1, "チームB", { isNew: true }),
      option(-2, "チームC", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [{ tempId: -1, id: 100 }],
      error: "選択肢の追加に失敗しました。",
    });
    expect(inserted.map((row) => row.value)).toEqual(["チームB"]);
    // INSERT に失敗したら UPDATE へ進まない
    expect(updated).toEqual([]);
  });

  it("UPDATE に失敗しても、INSERT できた行の対応を返す", async () => {
    const { client } = createSupabaseMock({ failUpdate: true });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "チームA"),
      option(-1, "チームB", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [{ tempId: -1, id: 100 }],
      error: "選択肢の更新に失敗しました。",
    });
  });
});
