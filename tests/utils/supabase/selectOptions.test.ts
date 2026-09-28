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

type Row = { id: number; value: string; is_active: boolean | null };

// select_option_types の取得・select_options の INSERT（1 行ずつ）・UPDATE を記録する
// Supabase クライアントのモック。rows は DB にある行で、UNIQUE(type_id, value) と同じく
// 無効化済みの行を含めて項目名が重なる INSERT / UPDATE を 23505 にする
const createSupabaseMock = ({
  rows: initialRows = [],
  failInsertAt,
  failUpdate = false,
  failUpdateIds = [],
  failType = false,
}: {
  rows?: Row[];
  failInsertAt?: number;
  failUpdate?: boolean;
  // 23505 以外のエラーにする UPDATE の行の id
  failUpdateIds?: number[];
  failType?: boolean;
} = {}) => {
  const rows: Row[] = initialRows.map((row) => ({ ...row }));
  const inserted: Record<string, unknown>[] = [];
  const updated: { id: number; values: Record<string, unknown> }[] = [];
  const reactivated: { value: unknown; values: Record<string, unknown> }[] =
    [];
  const operations: string[] = [];
  let nextId = 100;
  // 同時に実行中の UPDATE の数（1 行ずつ順番に実行しているかの確認用）
  let updatesInFlight = 0;
  let maxUpdatesInFlight = 0;
  // UPDATE を送った時点で実行中だった UPDATE の数（自分を含む）。行の id ごと・送った順
  const inFlightAtStart: Record<number, number[]> = {};
  const uniqueViolation = { code: "23505", message: "duplicate key value" };

  // update(...).eq(...)...（await で実行）。eq("id").select("id") は 1 行の UPDATE
  // （DB に無い行は 0 行を返す）、eq("type_id").eq("value").not("is_active", "is", true)
  // .select("id") は再有効化。UPDATE は次のタスクで実行し、同時実行数を記録する
  const updateBuilder = (values: Record<string, unknown>) => {
    const filters: Record<string, unknown> = {};
    let onlyInactive = false;
    const execute = () => {
      if ("id" in filters) {
        const id = filters.id as number;
        operations.push(`update:${id}`);
        updated.push({ id, values });
        if (failUpdate || failUpdateIds.includes(id)) {
          return { data: null, error: { message: "update failed" } };
        }
        if (
          typeof values.value === "string" &&
          rows.some((r) => r.id !== id && r.value === values.value)
        ) {
          return { data: null, error: uniqueViolation };
        }
        const row = rows.find((r) => r.id === id);
        if (row) Object.assign(row, values);
        return { data: row ? [{ id }] : [], error: null };
      }
      expect(onlyInactive).toBe(true);
      expect(filters.type_id).toBe("type-team");
      operations.push(`reactivate:${filters.value}`);
      reactivated.push({ value: filters.value, values });
      const targets = rows.filter(
        (r) => r.value === filters.value && r.is_active !== true,
      );
      targets.forEach((r) => Object.assign(r, values));
      return { data: targets.map((r) => ({ id: r.id })), error: null };
    };
    const builder = {
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      not: (column: string, operator: string, value: unknown) => {
        expect([column, operator, value]).toEqual(["is_active", "is", true]);
        onlyInactive = true;
        return builder;
      },
      select: () => builder,
      then: (resolve: (result: unknown) => void) => {
        updatesInFlight += 1;
        maxUpdatesInFlight = Math.max(maxUpdatesInFlight, updatesInFlight);
        if ("id" in filters) {
          const id = filters.id as number;
          (inFlightAtStart[id] ??= []).push(updatesInFlight);
        }
        setTimeout(() => {
          updatesInFlight -= 1;
          resolve(execute());
        }, 0);
      },
    };
    return builder;
  };

  const from = vi.fn((table: string) => {
    if (table === "select_option_types") {
      return {
        select: () => ({
          eq: () => ({
            single: async () =>
              failType
                ? { data: null, error: { message: "type fetch failed" } }
                : { data: { id: "type-team" }, error: null },
          }),
        }),
      };
    }
    return {
      insert: (values: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            operations.push(`insert:${values.value}`);
            if (failInsertAt === inserted.length) {
              return { data: null, error: { message: "insert failed" } };
            }
            if (rows.some((r) => r.value === values.value)) {
              return { data: null, error: uniqueViolation };
            }
            inserted.push(values);
            const id = nextId++;
            rows.push({
              id,
              value: values.value as string,
              is_active: values.is_active as boolean,
            });
            return { data: { id }, error: null };
          },
        }),
      }),
      update: updateBuilder,
    };
  });

  return {
    client: { from },
    rows,
    inserted,
    updated,
    reactivated,
    operations,
    maxUpdatesInFlight: () => maxUpdatesInFlight,
    inFlightAtStart,
  };
};

const option = (
  id: number,
  value: string,
  overrides: {
    is_active?: boolean;
    isNew?: boolean;
    display_order?: number;
    valueChanged?: boolean;
  } = {},
) => ({
  id,
  value,
  display_order: Math.abs(id),
  is_active: true,
  isNew: false,
  ...overrides,
});

const duplicateMessage = (value: string) =>
  `「${value}」と同じ名前の項目が既にあります（削除済みの項目を含む）。名前を変えるか、既存の項目を使ってください。`;

describe("bulkUpsertSelectOptions", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("追加した行を 1 行ずつ INSERT し、画面上の仮 id と DB の id の対応を返す", async () => {
    const { client, inserted, updated } = createSupabaseMock({
      rows: [{ id: 1, value: "チームA", is_active: true }],
    });
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
      updatedIds: [1],
    });
    expect(inserted.map((row) => row.value)).toEqual(["チームB", "チームC"]);
    expect(inserted[0]).toMatchObject({ type_id: "type-team", is_active: true });
    expect(updated.map((row) => row.id)).toEqual([1]);
  });

  it("既存の行を先に UPDATE してから追加する（名前を変えた元の名前を同じ保存で追加できる）", async () => {
    const { client, rows, operations } = createSupabaseMock({
      rows: [{ id: 1, value: "広報", is_active: true }],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "広報2"),
      option(-1, "広報", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [{ tempId: -1, id: 100 }],
      updatedIds: [1],
    });
    expect(operations).toEqual(["update:1", "insert:広報"]);
    expect(rows.map((row) => row.value)).toEqual(["広報2", "広報"]);
  });

  it("追加しようとした名前の削除済み（無効化済み）の行があれば、その行を再び有効にして id を返す", async () => {
    const { client, rows, inserted, reactivated } = createSupabaseMock({
      rows: [
        { id: 1, value: "チームA", is_active: true },
        { id: 5, value: "広報", is_active: false },
      ],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "チームA"),
      option(-2, "広報", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [{ tempId: -2, id: 5 }],
      updatedIds: [1],
    });
    expect(inserted).toEqual([]);
    // 表示順は追加した行の位置にする
    expect(reactivated).toEqual([
      {
        value: "広報",
        values: expect.objectContaining({ is_active: true, display_order: 2 }),
      },
    ]);
    expect(rows.find((row) => row.id === 5)?.is_active).toBe(true);
  });

  it("同じ保存で項目を削除して同じ名前を追加すると、削除した行を再び有効にする", async () => {
    const { client, rows, operations } = createSupabaseMock({
      rows: [{ id: 5, value: "広報", is_active: true }],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(5, "広報", { is_active: false }),
      option(-1, "広報", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [{ tempId: -1, id: 5 }],
      updatedIds: [5],
    });
    expect(operations).toEqual(["update:5", "insert:広報", "reactivate:広報"]);
    expect(rows).toEqual([
      expect.objectContaining({ id: 5, value: "広報", is_active: true }),
    ]);
  });

  it("追加しようとした名前が有効な行と重なる場合は、分かるメッセージを返す", async () => {
    const { client } = createSupabaseMock({
      rows: [{ id: 1, value: "チームA", is_active: true }],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "チームA"),
      option(-1, "チームB", { isNew: true }),
      option(-2, "チームA", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [{ tempId: -1, id: 100 }],
      updatedIds: [1],
      error: duplicateMessage("チームA"),
    });
  });

  it("名前の変更が削除済みの行の名前と重なる場合（UPDATE の 23505）も、分かるメッセージを返し、追加へ進まない", async () => {
    const { client, inserted } = createSupabaseMock({
      rows: [
        { id: 1, value: "チームA", is_active: true },
        { id: 5, value: "広報", is_active: false },
      ],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "広報"),
      option(-1, "チームB", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [],
      error: duplicateMessage("広報"),
    });
    expect(inserted).toEqual([]);
  });

  it("追加してすぐ削除した行は送らず、保存済みの行の削除は無効化（UPDATE）する", async () => {
    const { client, inserted, updated } = createSupabaseMock({
      rows: [{ id: 100, value: "チームB", is_active: true }],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(100, "チームB", { is_active: false }),
      option(-1, "取り消し", { isNew: true, is_active: false }),
    ]);

    expect(result).toEqual({ insertedIds: [], updatedIds: [100] });
    expect(inserted).toEqual([]);
    expect(updated).toEqual([
      { id: 100, values: expect.objectContaining({ is_active: false }) },
    ]);
  });

  it("INSERT が途中で失敗したら、それまでに INSERT できた行の対応とエラーを返す（例外にしない）", async () => {
    const { client, inserted, updated } = createSupabaseMock({
      rows: [{ id: 1, value: "チームA", is_active: true }],
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
      updatedIds: [1],
      error: "項目の追加に失敗しました。",
    });
    expect(inserted.map((row) => row.value)).toEqual(["チームB"]);
    expect(updated.map((row) => row.id)).toEqual([1]);
  });

  it("UPDATE に失敗したら、追加へ進まずにエラーを返す", async () => {
    const { client, inserted } = createSupabaseMock({
      rows: [{ id: 1, value: "チームA", is_active: true }],
      failUpdate: true,
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "チームA"),
      option(-1, "チームB", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [],
      error: "項目の更新に失敗しました。",
    });
    expect(inserted).toEqual([]);
  });

  it("選択肢の種類の取得に失敗したら、何も追加せずにエラーを返す（UPDATE できた行は返す）", async () => {
    const { client, inserted } = createSupabaseMock({
      rows: [{ id: 1, value: "チームA", is_active: true }],
      failType: true,
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "チームA"),
      option(-1, "チームB", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [1],
      error: "選択肢の種類の取得に失敗しました。",
    });
    expect(inserted).toEqual([]);
  });

  it("選択肢の種類の取得に失敗したら（追加する行だけの保存）、insertedIds を空にしてエラーを返す", async () => {
    const { client, inserted } = createSupabaseMock({ failType: true });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(-1, "チームB", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [],
      error: "選択肢の種類の取得に失敗しました。",
    });
    expect(inserted).toEqual([]);
  });
  it("既存の行は 1 行ずつ順番に UPDATE する", async () => {
    const { client, maxUpdatesInFlight } = createSupabaseMock({
      rows: [
        { id: 1, value: "チームA", is_active: true },
        { id: 2, value: "チームB", is_active: true },
        { id: 3, value: "チームC", is_active: true },
      ],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "チームA2"),
      option(2, "チームB2"),
      option(3, "チームC2"),
    ]);

    expect(result).toEqual({ insertedIds: [], updatedIds: [1, 2, 3] });
    expect(maxUpdatesInFlight()).toBe(1);
  });

  it("連鎖した名前の変更（P→Q と Q→R）は、送った順に関わらず Q→R を済ませてから P→Q を保存する", async () => {
    const { client, rows, operations } = createSupabaseMock({
      rows: [
        { id: 1, value: "P", is_active: true },
        { id: 2, value: "Q", is_active: true },
      ],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "Q"),
      option(2, "R"),
    ]);

    expect(result).toEqual({ insertedIds: [], updatedIds: [2, 1] });
    // P→Q は一意制約違反で後回しになり、Q→R の後に再び試す
    expect(operations).toEqual(["update:1", "update:2", "update:1"]);
    expect(rows.map((row) => row.value)).toEqual(["Q", "R"]);
  });

  it("名前の入れ替え（P→Q と Q→P）は 1 周で進まないため、分かるメッセージを返して追加へ進まない", async () => {
    const { client, rows, inserted } = createSupabaseMock({
      rows: [
        { id: 1, value: "P", is_active: true },
        { id: 2, value: "Q", is_active: true },
      ],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "Q"),
      option(2, "P"),
      option(-1, "S", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [],
      error: duplicateMessage("Q"),
    });
    expect(rows.map((row) => row.value)).toEqual(["P", "Q"]);
    expect(inserted).toEqual([]);
  });

  it("一意制約違反で後回しにした行があっても、23505 以外の失敗はログに残してエラーを返す", async () => {
    const { client } = createSupabaseMock({
      rows: [
        { id: 1, value: "チームA", is_active: true },
        { id: 2, value: "チームB", is_active: true },
        { id: 5, value: "広報", is_active: false },
      ],
      failUpdateIds: [2],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "広報"),
      option(2, "チームB2"),
    ]);

    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [],
      error: "項目の更新に失敗しました。",
    });
    expect(console.error).toHaveBeenCalledWith(
      "選択肢の更新に失敗しました: 2",
      { message: "update failed" },
    );
  });

  it("UPDATE で更新できた行が 0 行（RLS・他の管理者の削除）なら、更新できた行に含めずにエラーを返す", async () => {
    const { client, inserted } = createSupabaseMock({
      // id: 2 は DB に無い
      rows: [{ id: 1, value: "チームA", is_active: true }],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "チームA2"),
      option(2, "チームB2"),
      option(-1, "チームC", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [1],
      error:
        "更新できなかった項目があります（削除されたか、更新する権限がありません）。画面を再読み込みしてください。",
    });
    expect(inserted).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });
  it("項目名を変えていない行（表示順・有効 / 無効だけを変えた行）は並行に UPDATE する", async () => {
    const { client, rows, maxUpdatesInFlight } = createSupabaseMock({
      rows: [
        { id: 1, value: "チームA", is_active: true },
        { id: 2, value: "チームB", is_active: true },
        { id: 3, value: "チームC", is_active: true },
      ],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(2, "チームB", { display_order: 1, valueChanged: false }),
      option(1, "チームA", { display_order: 2, valueChanged: false }),
      option(3, "チームC", { is_active: false, valueChanged: false }),
    ]);

    expect(result).toEqual({ insertedIds: [], updatedIds: [2, 1, 3] });
    expect(maxUpdatesInFlight()).toBe(3);
    expect(rows.find((row) => row.id === 3)?.is_active).toBe(false);
  });

  it("項目名を変えた行だけを 1 行ずつ UPDATE し、それ以外の行は先に並行に UPDATE する", async () => {
    const { client, operations, inFlightAtStart } = createSupabaseMock({
      rows: [
        { id: 1, value: "P", is_active: true },
        { id: 2, value: "Q", is_active: true },
        { id: 3, value: "チームC", is_active: true },
        { id: 4, value: "チームD", is_active: true },
      ],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "Q", { valueChanged: true }),
      option(3, "チームC", { display_order: 4, valueChanged: false }),
      option(2, "R", { valueChanged: true }),
      option(4, "チームD", { display_order: 3, valueChanged: false }),
      option(-1, "チームE", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [{ tempId: -1, id: 100 }],
      updatedIds: [3, 4, 2, 1],
    });
    expect(operations).toEqual([
      "update:3",
      "update:4",
      // 連鎖した名前の変更は 1 行ずつ（P→Q は後回しにして Q→R の後に再び試す）
      "update:1",
      "update:2",
      "update:1",
      "insert:チームE",
    ]);
    // 3 と 4 は同時に送り（4 を送った時点で 3 が実行中）、名前を変えた行は他の UPDATE が
    // 実行中でない時に 1 行ずつ送る
    expect(inFlightAtStart[3]).toEqual([1]);
    expect(inFlightAtStart[4]).toEqual([2]);
    expect(inFlightAtStart[1]).toEqual([1, 1]);
    expect(inFlightAtStart[2]).toEqual([1]);
  });

  it("並行に UPDATE した行が一意制約違反になった場合は、名前を変えた行と同じく後回しにして再び試す", async () => {
    const { client, rows } = createSupabaseMock({
      rows: [
        { id: 1, value: "P", is_active: true },
        { id: 2, value: "Q", is_active: true },
      ],
    });
    createServerSupabase.mockReturnValue(client);

    // 名前を変えたのに valueChanged: false で送られた場合も、名前の変更は失わない
    const result = await bulkUpsertSelectOptions("team", [
      option(1, "Q", { valueChanged: false }),
      option(2, "R", { valueChanged: false }),
    ]);

    expect(result).toEqual({ insertedIds: [], updatedIds: [2, 1] });
    expect(rows.map((row) => row.value)).toEqual(["Q", "R"]);
  });

  it("並行に UPDATE した行の一部が失敗したら、更新できた行を返してエラーにし、名前の変更・追加へ進まない", async () => {
    const { client, operations, inserted } = createSupabaseMock({
      // id: 3 は DB に無い（0 行の UPDATE）
      rows: [
        { id: 1, value: "チームA", is_active: true },
        { id: 2, value: "チームB", is_active: true },
        { id: 4, value: "チームD", is_active: true },
      ],
      failUpdateIds: [2],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "チームA", { display_order: 5, valueChanged: false }),
      option(3, "チームC", { display_order: 6, valueChanged: false }),
      option(2, "チームB", { display_order: 7, valueChanged: false }),
      option(4, "チームD2", { valueChanged: true }),
      option(-1, "チームE", { isNew: true }),
    ]);

    // 最初に失敗した行（送った順）のメッセージを返す
    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [1],
      error:
        "更新できなかった項目があります（削除されたか、更新する権限がありません）。画面を再読み込みしてください。",
    });
    expect(operations).toEqual(["update:1", "update:3", "update:2"]);
    expect(inserted).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(
      "選択肢の更新に失敗しました: 2",
      { message: "update failed" },
    );
  });
});
