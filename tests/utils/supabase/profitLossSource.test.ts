import { describe, expect, it, vi } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";

vi.mock("@/app/utils/supabase/clients", () => ({
  createServerSupabase: vi.fn(),
}));
vi.mock("@/app/utils/supabase/selectOptionsCache", () => ({
  getActiveSelectOptionsByType: vi.fn(),
}));

import { PAGE_SIZE, fetchAllPages } from "@/app/utils/supabase/profitLossSource";

describe("fetchAllPages（PostgREST の max_rows 打ち切り対策）", () => {
  it("1 ページが PAGE_SIZE 件なら次のページも取得し、全件をつなげる", async () => {
    const all = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => i);
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: all.slice(from, to + 1),
      error: null,
    }));
    const result = await fetchAllPages(fetchPage);
    expect(result.data).toEqual(all);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, PAGE_SIZE - 1);
    expect(fetchPage).toHaveBeenNthCalledWith(2, PAGE_SIZE, PAGE_SIZE * 2 - 1);
  });

  it("通常（PAGE_SIZE 未満）は 1 往復で終わり、エラーはそのまま返す", async () => {
    const fetchPage = vi.fn(async () => ({ data: [1, 2], error: null }));
    expect((await fetchAllPages(fetchPage)).data).toEqual([1, 2]);
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
