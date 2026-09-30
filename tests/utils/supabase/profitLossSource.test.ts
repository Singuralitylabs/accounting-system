import { describe, expect, it, vi } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";

vi.mock("@/app/utils/supabase/clients", () => ({
  createServerSupabase: vi.fn(),
}));

import {
  ID_CHUNK_SIZE,
  PAGE_SIZE,
  fetchAllByIds,
  fetchAllPages,
} from "@/app/utils/supabase/paging";
import { createServerSupabase } from "@/app/utils/supabase/clients";
import {
  collectLabelTargetIds,
  fetchReportSourceRows,
} from "@/app/utils/supabase/profitLossSource";
import type { ReportSourceRows } from "@/app/utils/supabase/profitLossSource";
import { fetchClosedMonthKeys } from "@/app/utils/supabase/closedMonthsQuery";
import {
  buildLiveMonthLines,
  reportFlags,
  type BusinessRow,
  type CostRow,
} from "@/app/utils/profitLossLogic";
import {
  buildMonthReport,
  monthLinesToClosingRows,
} from "@/app/utils/profitLossClosing";
import type {
  ClosingLineInput,
  ProfitLossAdjustmentType,
  ProfitLossLabelType,
  RecurringCostType,
} from "@/app/types/types";

describe("fetchAllPages（PostgREST の max_rows 打ち切り対策）", () => {
  it("1 ページが PAGE_SIZE 件なら直前の最大 id の次から取得し、全件をつなげる", async () => {
    // Ids skip (deleted rows exist).
    const all = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => ({
      id: i * 2 + 1,
    }));
    const fetchPage = vi.fn(async (afterId: number, limit: number) => ({
      data: all.filter((row) => row.id > afterId).slice(0, limit),
      error: null,
    }));
    const result = await fetchAllPages(fetchPage);
    expect(result.data).toEqual(all);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, PAGE_SIZE);
    expect(fetchPage).toHaveBeenNthCalledWith(
      2,
      all[PAGE_SIZE - 1].id,
      PAGE_SIZE,
    );
  });

  it("通常（PAGE_SIZE 未満）は 1 往復で終わり、エラーはそのまま返す", async () => {
    const fetchPage = vi.fn(async () => ({
      data: [{ id: 1 }, { id: 2 }],
      error: null,
    }));
    expect((await fetchAllPages(fetchPage)).data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(fetchPage).toHaveBeenCalledTimes(1);

    const error = {
      name: "PostgrestError",
      message: "boom",
      details: "",
      hint: "",
      code: "X",
    } as PostgrestError;
    const failing = vi.fn(async () => ({ data: null, error }));
    expect(await fetchAllPages(failing)).toEqual({ data: null, error });
  });
});

describe("fetchAllByIds（ID 指定の取得の分割・ページング）", () => {
  it("ID を重複なしで ID_CHUNK_SIZE 件ずつに分け、それぞれをページングして全件をつなげる", async () => {
    const ids = Array.from({ length: ID_CHUNK_SIZE + 10 }, (_, i) => i + 1);
    const fetchPage = vi.fn((chunk: number[], afterId: number) =>
      Promise.resolve({
        data: chunk.filter((id) => id > afterId).map((id) => ({ id })),
        error: null,
      }),
    );
    const result = await fetchAllByIds([...ids, 1, 2], fetchPage);
    expect(result.error).toBeNull();
    expect(result.data?.map((row) => row.id)).toEqual(ids);
    expect(fetchPage.mock.calls.map((call) => call[0].length)).toEqual([
      ID_CHUNK_SIZE,
      10,
    ]);
  });

  it("ID が無ければ問い合わせず、失敗があればエラーを返す", async () => {
    const fetchPage = vi.fn();
    expect(await fetchAllByIds([], fetchPage)).toEqual({
      data: [],
      error: null,
    });
    expect(fetchPage).not.toHaveBeenCalled();
    const error = { message: "boom" } as PostgrestError;
    const failed = await fetchAllByIds([1], () =>
      Promise.resolve({ data: null, error }),
    );
    expect(failed).toEqual({ data: null, error });
  });
});

describe("調整対象行の補完取得のスキップ条件（Issue #142）", () => {
  const period = { startMonth: "2026-07", endMonth: "2026-07" };

  const tablesWithOrphan = (): Record<string, FakeRow[]> => ({
    business: [
      {
        ...businessRow(99, 30),
        matters: { ...matterOf(30), start_date: "2026-08-05" },
      } as unknown as FakeRow,
    ],
    costs: [],
    recurring_costs: [],
    extra_entries: [],
    profit_loss_adjustments: [
      {
        ...adjustmentRow(1, { business_id: 99 }),
        target_month: "2026-07-01",
      } as FakeRow,
    ],
    profit_loss_closings: [],
    profit_loss_closing_lines: [],
    profit_loss_closing_dismissals: [],
    profit_loss_labels: [],
  });
  const julyOnly = {
    business: (row: FakeRow) =>
      (row as unknown as BusinessRow).matters.start_date?.startsWith(
        "2026-07",
      ) ?? false,
  };
  const supplementQueries = (calls: QueryCall[]) =>
    calls.filter(
      (call) =>
        call.table === "business" &&
        call.method === "in" &&
        call.args[0] === "id",
    );

  it("includeAdjustmentDetails が false なら補完クエリを発行しない", async () => {
    const { calls } = fakeSupabase(tablesWithOrphan(), julyOnly);

    const rows = await fetchReportSourceRows(period, {
      supplement: {
        month: "2026-07",
        includeAdjustmentDetails: false,
        includeMonthlyDetails: true,
      },
    });

    expect(supplementQueries(calls)).toEqual([]);
    expect(rows?.businessRows).toEqual([]);
  });

  it("年間推移（includeMonthlyDetails が false）なら補完クエリを発行しない", async () => {
    const { calls } = fakeSupabase(tablesWithOrphan(), julyOnly);

    const rows = await fetchReportSourceRows(period, {
      supplement: {
        month: "2026-07",
        includeAdjustmentDetails: true,
        includeMonthlyDetails: false,
      },
    });

    expect(supplementQueries(calls)).toEqual([]);
    expect(rows?.businessRows).toEqual([]);
  });

  it("月次表示（両方 true。省略時含む）なら欠けている対象行を補完取得する", async () => {
    const { calls } = fakeSupabase(tablesWithOrphan(), julyOnly);

    const rows = await fetchReportSourceRows(period, {
      supplement: { month: "2026-07" },
    });

    expect(supplementQueries(calls)).toHaveLength(1);
    expect(rows?.businessRows.map((row) => row.id)).toEqual([99]);
  });
});

const matterOf = (id: number) => ({
  id,
  user_id: 5,
  title: `案件${id}`,
  team: "シンラボ",
  category: "受託案件",
  start_date: "2026-08-10",
  is_fixed: true,
  is_completed: false,
});
const businessRow = (id: number, matterId: number): BusinessRow => ({
  id,
  name: `取引先${id}`,
  amount: 1000,
  matter_id: matterId,
  matters: matterOf(matterId),
});
const costRow = (id: number, matterId: number): CostRow => ({
  id,
  name: `コスト${id}`,
  price: 500,
  item: "外注費",
  matter_id: matterId,
  matters: matterOf(matterId),
});
const recurringRow = (id: number): RecurringCostType => ({
  id,
  name: `定期${id}`,
  item: "施設利用料",
  price: 100000,
  team: null,
  payment_cycle: "monthly",
  start_month: "2026-01-01",
  end_month: null,
  comment: null,
  inserted_at: "2026-01-01T00:00:00+09:00",
  updated_at: "2026-01-01T00:00:00+09:00",
});
type AdjustmentTarget = Pick<
  ProfitLossAdjustmentType,
  "business_id" | "cost_id" | "recurring_cost_id"
>;
const adjustmentRow = (
  id: number,
  target: Partial<AdjustmentTarget>,
): ProfitLossAdjustmentType => ({
  id,
  target_month: "2026-08-01",
  business_id: null,
  cost_id: null,
  recurring_cost_id: null,
  ...target,
  adjustment_amount: 1000,
  source_amount_snapshot: 0,
  reason: "理由",
  adjusted_by: 1,
  inserted_at: "2026-08-01T00:00:00+09:00",
  updated_at: "2026-08-01T00:00:00+09:00",
});
const closingLine = (
  sourceType: string,
  sourceId: number,
  matterId: number | null,
) =>
  ({
    source_type: sourceType,
    source_id: sourceId,
    matter_id: matterId,
  }) as ClosingLineInput;
const labelRow = (
  id: number,
  target: Partial<
    Pick<
      ProfitLossLabelType,
      "matter_id" | "business_id" | "cost_id" | "recurring_cost_id"
    >
  >,
): ProfitLossLabelType => ({
  matter_id: null,
  business_id: null,
  cost_id: null,
  recurring_cost_id: null,
  ...target,
  id,
  label: `タイトル${id}`,
  updated_by: 1,
  inserted_at: "",
  updated_at: "",
});

// Simple Supabase mock holding rows per table. .in / .gt("id") filter rows like real PostgREST and record calls.
type QueryCall = { table: string; method: string; args: unknown[] };
type FakeRow = { id: number } & Record<string, unknown>;
// periodFilters: row conditions applied to period-scoped fetches (business / costs etc. using .or()),
// standing in for PostgREST's period filter. Not applied to ID-based supplement fetches.
const fakeSupabase = (
  tables: Record<string, FakeRow[]>,
  periodFilters: Record<string, (row: FakeRow) => boolean> = {},
) => {
  const calls: QueryCall[] = [];
  const buildQuery = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const query: Record<string, unknown> = {};
    const periodFilter = periodFilters[table];
    const chain =
      (method: string, apply?: (...args: unknown[]) => void) =>
      (...args: unknown[]) => {
        calls.push({ table, method, args });
        apply?.(...args);
        return query;
      };
    query.select = chain("select");
    query.or = chain("or", () => {
      if (periodFilter) {
        rows = rows.filter(periodFilter);
      }
    });
    query.lt = chain("lt");
    query.gte = chain("gte");
    query.order = chain("order");
    query.in = chain("in", (column, ids) => {
      rows = rows.filter((row) =>
        (ids as unknown[]).includes(row[column as string]),
      );
    });
    query.gt = chain("gt", (column, value) => {
      if (column === "id") {
        rows = rows.filter((row) => row.id > (value as number));
      }
    });
    query.limit = (limit: number) => {
      calls.push({ table, method: "limit", args: [limit] });
      return Promise.resolve({ data: rows.slice(0, limit), error: null });
    };
    // The closing header fetch is awaited without limit.
    query.then = (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    return query;
  };
  const from = vi.fn(buildQuery);
  vi.mocked(createServerSupabase).mockReset();
  vi.mocked(createServerSupabase).mockReturnValue({
    from,
  } as unknown as ReturnType<typeof createServerSupabase>);
  const labelInCalls = () =>
    calls.filter(
      (call) => call.table === "profit_loss_labels" && call.method === "in",
    );
  return { from, buildQuery, calls, labelInCalls };
};

const sourceTables = (): Record<string, FakeRow[]> => ({
  business: [businessRow(1, 10)],
  costs: [costRow(2, 10)],
  recurring_costs: [recurringRow(3)],
  extra_entries: [],
  profit_loss_adjustments: [adjustmentRow(1, { business_id: 7 })],
  profit_loss_closings: [{ id: 1, target_month: "2026-08-01" }],
  profit_loss_closing_lines: [
    { id: 1, closing_id: 1, ...closingLine("business", 50, 20) },
    { id: 2, closing_id: 1, ...closingLine("recurring_cost", 60, null) },
    { id: 3, closing_id: 1, ...closingLine("extra_entry", 70, null) },
  ],
  profit_loss_closing_dismissals: [],
  profit_loss_labels: [
    labelRow(1, { matter_id: 10 }),
    labelRow(2, { business_id: 1 }),
    labelRow(3, { cost_id: 2 }),
    labelRow(4, { recurring_cost_id: 3 }),
    labelRow(5, { business_id: 7 }),
    labelRow(6, { matter_id: 20 }),
    labelRow(7, { business_id: 50 }),
    labelRow(8, { recurring_cost_id: 60 }),
    labelRow(90, { matter_id: 99 }),
    labelRow(91, { business_id: 99 }),
    labelRow(92, { cost_id: 99 }),
    labelRow(93, { recurring_cost_id: 99 }),
  ],
});

const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);

describe("collectLabelTargetIds（表示タイトルの取得対象。Issue #172）", () => {
  it("ライブの行・損益調整の対象・確定明細（売上・費用・定期費用）の ID を種別ごとに重複なしで集める", () => {
    const ids = collectLabelTargetIds({
      businessRows: [businessRow(1, 10), businessRow(4, 10)],
      costRows: [costRow(2, 11)],
      recurringCosts: [recurringRow(3)],
      adjustments: [
        adjustmentRow(1, { business_id: 7 }),
        adjustmentRow(2, { cost_id: 8 }),
        adjustmentRow(3, { recurring_cost_id: 9 }),
        adjustmentRow(4, { business_id: 1 }),
      ],
      closings: new Map([
        [
          "2026-08",
          {
            header: {
              target_month: "2026-08-01",
              closed_at: "",
              closed_by_name: "経理太郎",
              refreshed_at: null,
              refreshed_by_name: null,
            },
            lines: [
              closingLine("business", 50, 20),
              closingLine("cost", 51, 21),
              closingLine("recurring_cost", 60, null),
              closingLine("extra_entry", 70, null),
              closingLine("business", 1, 10),
            ],
            dismissals: [],
          },
        ],
      ]),
    });
    expect(sorted(ids.matterIds)).toEqual([10, 11, 20, 21]);
    expect(sorted(ids.businessIds)).toEqual([1, 4, 7, 50]);
    expect(sorted(ids.costIds)).toEqual([2, 8, 51]);
    expect(sorted(ids.recurringCostIds)).toEqual([3, 9, 60]);
  });
});

describe("fetchReportSourceRows の表示タイトルの取得（Issue #172）", () => {
  const month = { startMonth: "2026-08", endMonth: "2026-08" };

  it("表示期間の明細に対応する表示タイトルだけを対象 ID の in 検索で取得する（全件取得しない）", async () => {
    const { calls, labelInCalls } = fakeSupabase(sourceTables());
    const rows = await fetchReportSourceRows(month);
    expect(rows).not.toBeNull();
    expect(sorted(rows!.labels.map((label) => label.id))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    const labelSelects = calls.filter(
      (call) => call.table === "profit_loss_labels" && call.method === "select",
    );
    expect(labelSelects.length).toBe(labelInCalls().length);
    expect(
      Object.fromEntries(
        labelInCalls().map((call) => [
          call.args[0],
          sorted(call.args[1] as number[]),
        ]),
      ),
    ).toEqual({
      matter_id: [10, 20],
      business_id: [1, 7, 50],
      cost_id: [2],
      recurring_cost_id: [3, 60],
    });
  });

  it("対象 ID が多い場合は ID_CHUNK_SIZE 件ずつに分けて問い合わせる（URL の長さ対策）", async () => {
    const tables = sourceTables();
    tables.business = Array.from({ length: ID_CHUNK_SIZE + 1 }, (_, i) =>
      businessRow(i + 1, 10),
    );
    const { labelInCalls } = fakeSupabase(tables);
    await fetchReportSourceRows(month);
    expect(
      labelInCalls()
        .filter((call) => call.args[0] === "business_id")
        .map((call) => (call.args[1] as number[]).length),
    ).toEqual([ID_CHUNK_SIZE, 1]);
  });

  it("年間推移（includeLabels: false）は表示タイトルを取得しない", async () => {
    const { from } = fakeSupabase(sourceTables());
    const rows = await fetchReportSourceRows(
      { startMonth: "2026-07", endMonth: "2027-06" },
      { includeLabels: false },
    );
    expect(rows?.labels).toEqual([]);
    expect(from.mock.calls.map((call) => call[0])).not.toContain(
      "profit_loss_labels",
    );
  });

  it("表示タイトルの取得に失敗したら null を返す", async () => {
    const { from, buildQuery } = fakeSupabase(sourceTables());
    from.mockImplementation((table: string) => {
      const query = buildQuery(table);
      if (table === "profit_loss_labels") {
        query.limit = () =>
          Promise.resolve({ data: null, error: { message: "boom" } });
      }
      return query;
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    expect(await fetchReportSourceRows(month)).toBeNull();
    consoleError.mockRestore();
  });
});

describe("調整対象行の補完取得の表示タイトルの追加取得（Issue #172）", () => {
  const period = { startMonth: "2026-08", endMonth: "2026-08" };
  const augustOnly = {
    business: (row: FakeRow) =>
      (row as unknown as BusinessRow).matters.start_date?.startsWith(
        "2026-08",
      ) ?? false,
  };
  const tables = (
    movedMatterId: number,
    labels: ProfitLossLabelType[],
  ): Record<string, FakeRow[]> => ({
    business: [
      businessRow(1, 10) as unknown as FakeRow,
      {
        ...businessRow(7, movedMatterId),
        matters: { ...matterOf(movedMatterId), start_date: "2026-09-05" },
      } as unknown as FakeRow,
    ],
    costs: [],
    recurring_costs: [],
    extra_entries: [],
    profit_loss_adjustments: [adjustmentRow(1, { business_id: 7 })],
    profit_loss_closings: [],
    profit_loss_closing_lines: [],
    profit_loss_closing_dismissals: [],
    profit_loss_labels: labels as unknown as FakeRow[],
  });

  it("補完した行の案件のうち、まだ問い合わせていない案件の表示タイトルだけを追加で取得する", async () => {
    const { labelInCalls } = fakeSupabase(
      tables(30, [
        labelRow(1, { matter_id: 30 }),
        labelRow(2, { matter_id: 99 }),
        labelRow(5, { business_id: 7 }),
      ]),
      augustOnly,
    );
    const rows = await fetchReportSourceRows(period, {
      supplement: { month: "2026-08" },
    });
    expect(rows?.businessRows.map((row) => row.id)).toEqual([1, 7]);
    expect(labelInCalls().at(-1)?.args).toEqual(["matter_id", [30]]);
    expect(sorted(rows!.labels.map((label) => label.id))).toEqual([1, 5]);
  });

  it("補完した行の案件が取得済みの案件なら表示タイトルを追加で問い合わせない", async () => {
    const { labelInCalls } = fakeSupabase(
      tables(10, [labelRow(1, { matter_id: 10 })]),
      augustOnly,
    );
    const rows = await fetchReportSourceRows(period, {
      supplement: { month: "2026-08" },
    });
    expect(rows?.businessRows.map((row) => row.id)).toEqual([1, 7]);
    expect(
      labelInCalls().filter((call) => call.args[0] === "matter_id"),
    ).toHaveLength(1);
    expect(rows?.labels.map((label) => label.id)).toEqual([1]);
  });
});

describe("fetchClosedMonthKeys の開始月の絞り込み（Issue #172）", () => {
  const closings = () => ({
    profit_loss_closings: [
      { id: 1, target_month: "2024-09-01" },
      { id: 2, target_month: "2024-10-01" },
    ],
  });

  it("fromMonth を渡すとその月の月初日以降で絞り、渡さなければ絞らない", async () => {
    const withFrom = fakeSupabase(closings());
    await fetchClosedMonthKeys({ fromMonth: "2024-10" });
    expect(
      withFrom.calls.filter((call) => call.method === "gte").map((c) => c.args),
    ).toEqual([["target_month", "2024-10-01"]]);

    const all = fakeSupabase(closings());
    expect(await fetchClosedMonthKeys()).toEqual({
      months: ["2024-09", "2024-10"],
    });
    expect(all.calls.some((call) => call.method === "gte")).toBe(false);
  });
});

describe("表示タイトルを絞って取得しても損益計算書の表示は変わらない（Issue #172 の受け入れ基準）", () => {
  const month = "2026-08";
  const inSeptember = <T extends BusinessRow | CostRow>(row: T): T => ({
    ...row,
    matters: { ...row.matters, start_date: "2026-09-10" },
  });

  it("確定済みの月（削除・他月への移動・追加の差分、対象行が期間外へ移動した調整の補完行を含む）で、全件取得した場合とレポート全体が一致する", async () => {
    const closedLines = monthLinesToClosingRows(
      buildLiveMonthLines({
        month,
        businessRows: [
          businessRow(1, 10),
          businessRow(7, 30),
          businessRow(50, 20),
        ],
        costRows: [costRow(2, 10)],
        recurringCosts: [recurringRow(3), recurringRow(60)],
        extraEntries: [],
        adjustments: [],
      }),
    );
    const businessTable = [
      businessRow(1, 10),
      businessRow(3, 11),
      inSeptember(businessRow(7, 30)),
      inSeptember(businessRow(8, 31)),
    ];
    const allLabels = [
      labelRow(1, { matter_id: 10 }),
      labelRow(2, { matter_id: 11 }),
      labelRow(3, { matter_id: 20 }),
      labelRow(4, { matter_id: 30 }),
      labelRow(5, { matter_id: 31 }),
      labelRow(6, { business_id: 1 }),
      labelRow(7, { business_id: 3 }),
      labelRow(8, { business_id: 7 }),
      labelRow(9, { business_id: 8 }),
      labelRow(10, { business_id: 50 }),
      labelRow(11, { cost_id: 2 }),
      labelRow(12, { recurring_cost_id: 3 }),
      labelRow(13, { recurring_cost_id: 60 }),
      labelRow(90, { matter_id: 99 }),
      labelRow(91, { business_id: 99 }),
      labelRow(92, { cost_id: 99 }),
      labelRow(93, { recurring_cost_id: 99 }),
    ];
    const { labelInCalls } = fakeSupabase(
      {
        business: businessTable,
        costs: [costRow(2, 10)],
        recurring_costs: [recurringRow(3)],
        extra_entries: [],
        profit_loss_adjustments: [
          adjustmentRow(1, { business_id: 8 }),
          adjustmentRow(2, { cost_id: 2 }),
        ],
        profit_loss_closings: [{ id: 1, target_month: "2026-08-01" }],
        profit_loss_closing_lines: closedLines.map((line, index) => ({
          ...line,
          id: index + 1,
          closing_id: 1,
        })),
        profit_loss_closing_dismissals: [],
        profit_loss_labels: allLabels,
      },
      {
        business: (row) =>
          (row as unknown as BusinessRow).matters.start_date?.startsWith(
            month,
          ) ?? false,
      },
    );

    const rows = await fetchReportSourceRows(
      { startMonth: month, endMonth: month },
      { supplement: { month } },
    );
    expect(rows).not.toBeNull();
    expect(labelInCalls().at(-1)?.args).toEqual(["matter_id", [31]]);
    expect(sorted(rows!.labels.map((label) => label.id))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);

    const build = (labels: ProfitLossLabelType[]) =>
      buildMonthReport({
        month,
        ...rows!,
        labels,
        closing: rows!.closings.get(month) ?? null,
        includeMonthlyDetails: true,
        ...reportFlags("accounting"),
      });
    const scoped = build(rows!.labels);
    const full = build(allLabels);
    expect(scoped).toEqual(full);

    // Ensure the data includes places where display titles are used (the comparison must not be vacuous).
    const matter10 = scoped.matterBreakdowns.find((m) => m.matterId === 10)!;
    expect(matter10.displayTitle).toBe("タイトル1");
    expect(matter10.businesses[0].displayTitle).toBe("タイトル6");
    expect(matter10.costs[0].displayTitle).toBe("タイトル11");
    const recurringTitles = scoped.recurringCostByItem.flatMap((item) =>
      item.details.map((line) => line.displayTitle),
    );
    expect(recurringTitles.sort()).toEqual(["タイトル12", "タイトル13"]);
    const diffs = [
      ...scoped.closingDiffs!.pending,
      ...scoped.closingDiffs!.dismissed,
    ];
    expect(
      diffs
        .map((diff) => [diff.key, diff.kind, diff.matterTitle, diff.name])
        .sort(),
    ).toEqual(
      [
        ["business:3", "added", "タイトル2", "タイトル7"],
        ["business:50", "removed", "タイトル3", "タイトル10"],
        ["business:7", "removed", "タイトル4", "タイトル8"],
        ["cost:2", "changed", "タイトル1", "タイトル11"],
      ].sort(),
    );
    expect(scoped.orphanedAdjustments?.map((o) => o.label)).toEqual([
      "タイトル5 - タイトル9",
    ]);
  });
});

describe("fetchReportSourceRows の調整対象行の補完取得（supplement。Issue #193）", () => {
  const period = { startMonth: "2026-08", endMonth: "2026-08" };
  const supplement = { month: "2026-08" };

  const movedBusiness = (): FakeRow =>
    ({
      ...businessRow(7, 30),
      matters: { ...matterOf(30), start_date: "2026-09-05" },
    }) as unknown as FakeRow;

  const tablesWithMovedBusiness = (): Record<string, FakeRow[]> => ({
    business: [businessRow(1, 10) as unknown as FakeRow, movedBusiness()],
    costs: [],
    recurring_costs: [],
    extra_entries: [],
    profit_loss_adjustments: [adjustmentRow(1, { business_id: 7 })],
    profit_loss_closings: [],
    profit_loss_closing_lines: [],
    profit_loss_closing_dismissals: [],
    profit_loss_labels: [
      labelRow(1, { matter_id: 10 }),
      labelRow(2, { business_id: 7 }),
      labelRow(3, { matter_id: 30 }),
      labelRow(99, { matter_id: 99 }),
    ],
  });

  const periodFilters = {
    business: (row: FakeRow) =>
      (row as unknown as BusinessRow).matters.start_date?.startsWith(
        "2026-08",
      ) ?? false,
  };

  it("補完行と、その案件の表示タイトルを取得して rows に加える", async () => {
    const { labelInCalls } = fakeSupabase(
      tablesWithMovedBusiness(),
      periodFilters,
    );
    const rows = await fetchReportSourceRows(period, { supplement });

    expect(rows?.businessRows.map((row) => row.id)).toEqual([1, 7]);
    expect(labelInCalls().at(-1)?.args).toEqual(["matter_id", [30]]);
    expect(sorted(rows!.labels.map((label) => label.id))).toEqual([1, 2, 3]);
  });

  // Live-row display titles and supplement rows are fetched in parallel (serial adds a round trip). The title
  // fetch does not resolve until the supplement fetch starts (a serial implementation never starts it,
  // so this times out).
  it("表示タイトルの取得と補完行の取得を並列に行う", async () => {
    const fake = fakeSupabase(tablesWithMovedBusiness(), periodFilters);
    let markSupplementStarted!: () => void;
    const supplementStarted = new Promise<void>((resolve) => {
      markSupplementStarted = resolve;
    });
    fake.from.mockImplementation((table: string) => {
      const query = fake.buildQuery(table);
      if (table === "business") {
        const original = query.in as (...args: unknown[]) => unknown;
        query.in = (...args: unknown[]) => {
          if (args[0] === "id" && (args[1] as number[]).includes(7)) {
            markSupplementStarted();
          }
          return original(...args);
        };
      }
      if (table === "profit_loss_labels") {
        const original = query.limit as (...args: unknown[]) => Promise<unknown>;
        query.limit = (...args: unknown[]) =>
          supplementStarted.then(() => original(...args));
      }
      return query;
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), 1000);
    });
    const result = await Promise.race([
      fetchReportSourceRows(period, { supplement }),
      timeout,
    ]).finally(() => clearTimeout(timer));

    expect(result).not.toBe("timeout");
    expect((result as ReportSourceRows).businessRows.map((r) => r.id)).toEqual([
      1, 7,
    ]);
  });

  it("補完が不要なら補完行を取得しない（欠けている対象行が無い）", async () => {
    const tables = tablesWithMovedBusiness();
    tables.profit_loss_adjustments = [adjustmentRow(1, { business_id: 1 })];
    const { calls } = fakeSupabase(tables, periodFilters);

    const rows = await fetchReportSourceRows(period, { supplement });

    expect(rows?.businessRows.map((row) => row.id)).toEqual([1]);
    expect(
      calls.filter(
        (call) =>
          call.table === "business" &&
          call.method === "in" &&
          call.args[0] === "id",
      ),
    ).toEqual([]);
  });

  it("teamleader（チーム別内訳なし）は補完行を取得しない", async () => {
    const { calls } = fakeSupabase(tablesWithMovedBusiness(), periodFilters);

    const rows = await fetchReportSourceRows(period, {
      supplement: { ...supplement, includeAdjustmentDetails: false },
    });

    expect(rows?.businessRows.map((row) => row.id)).toEqual([1]);
    expect(
      calls.filter(
        (call) =>
          call.table === "business" &&
          call.method === "in" &&
          call.args[0] === "id",
      ),
    ).toEqual([]);
  });
});
