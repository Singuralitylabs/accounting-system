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
import { supplementAdjustmentTargets } from "@/app/utils/supabase/profitLossSource";
import type { ReportSourceRows } from "@/app/utils/supabase/profitLossSource";

describe("fetchAllPages（PostgREST の max_rows 打ち切り対策）", () => {
  it("1 ページが PAGE_SIZE 件なら直前の最大 id の次から取得し、全件をつなげる", async () => {
    // id は飛び番（削除済みの行がある）
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

describe("supplementAdjustmentTargets の teamleader スキップ（Issue #142）", () => {
  const rowsWithOrphan = (): ReportSourceRows => ({
    businessRows: [],
    costRows: [],
    recurringCosts: [],
    extraEntries: [],
    adjustments: [
      {
        id: 1,
        target_month: "2026-07-01",
        business_id: 99,
        cost_id: null,
        recurring_cost_id: null,
        adjustment_amount: 1000,
        source_amount_snapshot: 0,
        reason: "理由",
        adjusted_by: 1,
        inserted_at: "2026-07-01T00:00:00+09:00",
        updated_at: "2026-07-01T00:00:00+09:00",
      },
    ],
    labels: [],
    closings: new Map(),
  });

  const emptyPageQuery = () => {
    const query: Record<string, unknown> = {};
    query.select = vi.fn(() => query);
    query.in = vi.fn(() => query);
    query.gt = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    return query;
  };

  it("includeTeamBreakdown が false なら補完クエリを発行しない", async () => {
    vi.mocked(createServerSupabase).mockReset();
    const rows = rowsWithOrphan();

    await supplementAdjustmentTargets("2026-07", rows, {
      includeTeamBreakdown: false,
    });

    expect(createServerSupabase).not.toHaveBeenCalled();
    expect(rows.businessRows).toEqual([]);
  });

  it("includeTeamBreakdown が true（省略時含む）なら欠けている対象行を補完取得する", async () => {
    vi.mocked(createServerSupabase).mockReset();
    vi.mocked(createServerSupabase).mockReturnValue({
      from: vi.fn(() => emptyPageQuery()),
    } as unknown as ReturnType<typeof createServerSupabase>);
    const rows = rowsWithOrphan();

    await supplementAdjustmentTargets("2026-07", rows, {
      includeTeamBreakdown: true,
    });

    expect(createServerSupabase).toHaveBeenCalled();
  });
});
