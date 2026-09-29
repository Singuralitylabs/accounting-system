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

// select_option_types の取得・select_options の INSERT（複数行を 1 回で）・既存行の取得・
// UPDATE を記録する Supabase クライアントのモック。rows は DB にある行で、
// UNIQUE(type_id, value) と同じく無効化済みの行を含めて項目名が重なる INSERT / UPDATE を
// 23505 にする（一括 INSERT は 1 行でも重なれば全体が失敗し、何も追加されない）
const createSupabaseMock = ({
  rows: initialRows = [],
  failInsertCall,
  returnFewerRows = false,
  failUpdate = false,
  failUpdateIds = [],
  failType = false,
  rowsAddedAfterFetch = [],
  failFetchExisting = false,
}: {
  rows?: Row[];
  // 23505 以外のエラーにする INSERT 呼び出しの番号（0 始まり）
  failInsertCall?: number;
  // INSERT は成功するが、RETURNING が最後の 1 行を返さない（戻り値の欠落の再現用）
  returnFewerRows?: boolean;
  failUpdate?: boolean;
  // 23505 以外のエラーにする UPDATE の行の id
  failUpdateIds?: number[];
  failType?: boolean;
  // 既存の行の取得（value IN (...)）を返した後に、他の管理者が追加した行（競合の再現用）
  rowsAddedAfterFetch?: Row[];
  failFetchExisting?: boolean;
} = {}) => {
  const rows: Row[] = initialRows.map((row) => ({ ...row }));
  const inserted: Record<string, unknown>[] = [];
  // INSERT の呼び出しごとの行の項目名（一括 INSERT の回数・まとめ方の確認用）
  const insertCalls: string[][] = [];
  let insertCallCount = 0;
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
      insert: (input: Record<string, unknown> | Record<string, unknown>[]) => ({
        select: async () => {
          const values = Array.isArray(input) ? input : [input];
          const call = insertCallCount++;
          insertCalls.push(values.map((v) => v.value as string));
          operations.push(`insert:${values.map((v) => v.value).join(",")}`);
          if (failInsertCall === call) {
            return { data: null, error: { message: "insert failed" } };
          }
          const names = values.map((v) => v.value);
          if (
            new Set(names).size !== names.length ||
            rows.some((r) => names.includes(r.value))
          ) {
            return { data: null, error: uniqueViolation };
          }
          const data = values.map((v) => {
            inserted.push(v);
            const id = nextId++;
            rows.push({
              id,
              value: v.value as string,
              is_active: v.is_active as boolean,
            });
            // 戻り値の並び順は入力順と一致しない場合がある（逆順にして確認する）
            return { id, value: v.value as string };
          });
          return {
            data: (returnFewerRows ? data.slice(0, -1) : data).reverse(),
            error: null,
          };
        },
      }),
      select: () => ({
        eq: async () => {
          operations.push("fetch");
          if (failFetchExisting) {
            return { data: null, error: { message: "fetch failed" } };
          }
          const data = rows.map((r) => ({ ...r }));
          rows.push(...rowsAddedAfterFetch.map((r) => ({ ...r })));
          return { data, error: null };
        },
      }),
      update: updateBuilder,
    };
  });

  return {
    client: { from },
    rows,
    inserted,
    insertCalls,
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

  it("追加した行を 1 回の INSERT でまとめて追加し、画面上の仮 id と DB の id の対応を項目名で返す", async () => {
    const { client, inserted, insertCalls, updated } = createSupabaseMock({
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
    // INSERT は 1 回だけ（戻り値の並びが入力順と逆でも、項目名で仮 id に対応付ける）
    expect(insertCalls).toEqual([["チームB", "チームC"]]);
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
    expect(operations).toEqual([
      "update:5",
      "insert:広報",
      "fetch",
      "reactivate:広報",
    ]);
    expect(rows).toEqual([
      expect.objectContaining({ id: 5, value: "広報", is_active: true }),
    ]);
  });

  it("追加しようとした名前が有効な行と重なる場合は、何も追加せずに分かるメッセージを返す", async () => {
    const { client, inserted, insertCalls } = createSupabaseMock({
      rows: [{ id: 1, value: "チームA", is_active: true }],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "チームA"),
      option(-1, "チームB", { isNew: true }),
      option(-2, "チームA", { isNew: true }),
    ]);

    // 重複は何かを書き込む前に見つけるため、他の追加行（チームB）も追加されない
    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [1],
      error: duplicateMessage("チームA"),
    });
    expect(inserted).toEqual([]);
    expect(insertCalls).toEqual([["チームB", "チームA"]]);
  });

  it("同じ保存で同じ名前を 2 行追加した場合は、何も追加せずに分かるメッセージを返す", async () => {
    const { client, inserted } = createSupabaseMock();
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(-1, "チームB", { isNew: true }),
      option(-2, "チームB", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [],
      error: duplicateMessage("チームB"),
    });
    expect(inserted).toEqual([]);
  });

  it("一括 INSERT が一意制約違反になったら、既存の行を 1 回取得して、新規は INSERT・削除済みの行は再有効化に振り分ける", async () => {
    const { client, rows, insertCalls, reactivated, operations } =
      createSupabaseMock({
        rows: [
          { id: 1, value: "チームA", is_active: true },
          { id: 5, value: "広報", is_active: false },
          { id: 6, value: "総務", is_active: null },
        ],
      });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(-1, "チームB", { isNew: true }),
      option(-2, "広報", { isNew: true }),
      option(-3, "チームC", { isNew: true }),
      option(-4, "総務", { isNew: true }),
    ]);

    // 仮 id と DB の id の対応は追加した順（新規行 → 再有効化した行の順に記録し、項目名で対応）
    expect(result.error).toBeUndefined();
    expect(result.insertedIds).toEqual(
      expect.arrayContaining([
        { tempId: -1, id: 100 },
        { tempId: -3, id: 101 },
        { tempId: -2, id: 5 },
        { tempId: -4, id: 6 },
      ]),
    );
    expect(result.insertedIds).toHaveLength(4);
    // 一括 INSERT（失敗）→ 既存の行の取得 → 新規だけまとめて INSERT → 再有効化
    expect(insertCalls).toEqual([
      ["チームB", "広報", "チームC", "総務"],
      ["チームB", "チームC"],
    ]);
    expect(operations.filter((op) => op === "fetch")).toEqual(["fetch"]);
    expect(reactivated.map((r) => r.value).sort()).toEqual(["広報", "総務"]);
    expect(rows.find((r) => r.id === 5)?.is_active).toBe(true);
    expect(rows.find((r) => r.id === 6)?.is_active).toBe(true);
  });

  it("既存の行の取得後に他の管理者が同じ名前を追加して INSERT が失敗したら、何も追加せずにエラーを返す", async () => {
    const { client } = createSupabaseMock({
      rows: [{ id: 5, value: "広報", is_active: false }],
      rowsAddedAfterFetch: [{ id: 50, value: "チームB", is_active: true }],
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(-1, "チームB", { isNew: true }),
      option(-2, "広報", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [],
      error: "項目の追加に失敗しました。",
    });
  });

  it("既存の行の取得に失敗したら、何も追加せずにエラーを返す", async () => {
    const { client, inserted } = createSupabaseMock({
      rows: [{ id: 5, value: "広報", is_active: false }],
      failFetchExisting: true,
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(-1, "チームB", { isNew: true }),
      option(-2, "広報", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [],
      error: "項目の追加に失敗しました。",
    });
    expect(inserted).toEqual([]);
  });

  it("20 行をまとめて追加しても INSERT は 1 回（往復を増やさない）", async () => {
    const { client, insertCalls, operations } = createSupabaseMock();
    createServerSupabase.mockReturnValue(client);
    const news = Array.from({ length: 20 }, (_, i) =>
      option(-(i + 1), `項目${i + 1}`, { isNew: true }),
    );

    const result = await bulkUpsertSelectOptions("team", news);

    expect(result.insertedIds).toHaveLength(20);
    expect(result.insertedIds).toContainEqual({ tempId: -1, id: 100 });
    expect(result.insertedIds).toContainEqual({ tempId: -20, id: 119 });
    expect(insertCalls).toHaveLength(1);
    expect(operations.filter((op) => op === "fetch")).toEqual([]);
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

  it("一括 INSERT が失敗したら、何も追加せずにエラーを返す（例外にしない。UPDATE できた行は返す）", async () => {
    const { client, inserted, updated } = createSupabaseMock({
      rows: [{ id: 1, value: "チームA", is_active: true }],
      failInsertCall: 0,
    });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(1, "チームA"),
      option(-1, "チームB", { isNew: true }),
      option(-2, "チームC", { isNew: true }),
    ]);

    expect(result).toEqual({
      insertedIds: [],
      updatedIds: [1],
      error: "項目の追加に失敗しました。",
    });
    expect(inserted).toEqual([]);
    expect(updated.map((row) => row.id)).toEqual([1]);
  });

  it("一括 INSERT は成功したが戻り値が入力より少ないときは、返ってきた行を insertedIds に入れてエラーを返す", async () => {
    const { client, inserted } = createSupabaseMock({ returnFewerRows: true });
    createServerSupabase.mockReturnValue(client);

    const result = await bulkUpsertSelectOptions("team", [
      option(-1, "チームB", { isNew: true }),
      option(-2, "チームC", { isNew: true }),
    ]);

    // 書き込まれた行のうち id が分かる行は画面が DB の id に置き換えられるようにする
    expect(inserted).toHaveLength(2);
    expect(result).toEqual({
      insertedIds: [{ tempId: -1, id: 100 }],
      updatedIds: [],
      error: "項目の追加に失敗しました。",
    });
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
