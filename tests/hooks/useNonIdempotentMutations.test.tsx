// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { bulkUpsertExtraEntry, bulkUpsertRecurringCost } = vi.hoisted(() => ({
  bulkUpsertExtraEntry: vi.fn(),
  bulkUpsertRecurringCost: vi.fn(),
}));

vi.mock("@/app/utils/supabase/extraEntries", () => ({
  bulkUpsertExtraEntry,
  getExtraEntryList: vi.fn(),
  getExtraEntrySuggestions: vi.fn(),
  getPreviousMonthExtraEntries: vi.fn(),
  copyExtraEntriesFromPreviousMonth: vi.fn(),
}));
vi.mock("@/app/utils/supabase/recurringCosts", () => ({
  bulkUpsertRecurringCost,
  getRecurringCostList: vi.fn(),
}));

import {
  ExtraEntryValidationError,
  useUpsertExtraEntry,
} from "@/app/hooks/useExtraEntryData";
import { useUpsertRecurringCost } from "@/app/hooks/useRecurringCostData";
import { QueryProvider } from "@/app/components/providers/QueryProvider";
import { useQueryClient } from "@tanstack/react-query";

// Bulk saves containing new-row INSERTs are non-idempotent: re-running mutationFn would double-insert.
// QueryProvider defaults to retry: 0, but use retry: 1 so the hook-level setting is what prevents
// re-execution if the default changes.
describe("非冪等な一括保存のミューテーションは失敗しても再実行しない", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    // The hook's onError logs via console.error; silence it to keep test output clean.
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        // Same retry: 1 as QueryProvider; zero wait so a re-run shows up immediately.
        mutations: { retry: 1, retryDelay: 0 },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("経理追加収支: 通信エラーでも bulkUpsertExtraEntry は 1 回だけ呼ばれる", async () => {
    bulkUpsertExtraEntry.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useUpsertExtraEntry(), { wrapper });

    await expect(result.current.mutateAsync([])).rejects.toThrow(
      "Failed to fetch",
    );
    expect(bulkUpsertExtraEntry).toHaveBeenCalledTimes(1);
  });

  it("経理追加収支: 保存が拒否されたら再実行せず ExtraEntryValidationError になる", async () => {
    bulkUpsertExtraEntry.mockResolvedValue({
      error: {
        kind: "validationFailed",
        message: "確定済みの月のエントリは編集できません",
      },
    });
    const { result } = renderHook(() => useUpsertExtraEntry(), { wrapper });

    const error = await result.current.mutateAsync([]).catch((e) => e);
    expect(error).toBeInstanceOf(ExtraEntryValidationError);
    expect(error.message).toBe("確定済みの月のエントリは編集できません");
    expect(bulkUpsertExtraEntry).toHaveBeenCalledTimes(1);
  });

  it("定期費用: 保存に失敗しても bulkUpsertRecurringCost は 1 回だけ呼ばれる", async () => {
    bulkUpsertRecurringCost.mockRejectedValue(
      new Error("定期費用情報の更新に失敗しました"),
    );
    const { result } = renderHook(() => useUpsertRecurringCost(), {
      wrapper,
    });

    await expect(result.current.mutateAsync([])).rejects.toThrow(
      "定期費用情報の更新に失敗しました",
    );
    expect(bulkUpsertRecurringCost).toHaveBeenCalledTimes(1);
  });

  it("経理追加収支: 保存できたか分からない（通信エラー）ときは一覧を無効化して取り直す", async () => {
    queryClient.setQueryData(["extraEntries", "list", "2026-09"], []);
    bulkUpsertExtraEntry.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useUpsertExtraEntry(), { wrapper });

    await expect(result.current.mutateAsync([])).rejects.toThrow();
    expect(
      queryClient.getQueryState(["extraEntries", "list", "2026-09"])
        ?.isInvalidated,
    ).toBe(true);
  });

  it("経理追加収支: 保存が拒否された（何も書き込まれていない）ときは一覧を無効化しない", async () => {
    queryClient.setQueryData(["extraEntries", "list", "2026-09"], []);
    bulkUpsertExtraEntry.mockResolvedValue({
      error: { kind: "validationFailed", message: "拒否" },
    });
    const { result } = renderHook(() => useUpsertExtraEntry(), { wrapper });

    await expect(result.current.mutateAsync([])).rejects.toThrow("拒否");
    expect(
      queryClient.getQueryState(["extraEntries", "list", "2026-09"])
        ?.isInvalidated,
    ).toBe(false);
  });

  it("定期費用: 保存に失敗したら一覧を無効化して取り直す（一部だけ反映されている可能性があるため）", async () => {
    queryClient.setQueryData(["recurringCosts", "all"], []);
    bulkUpsertRecurringCost.mockRejectedValue(new Error("失敗"));
    const { result } = renderHook(() => useUpsertRecurringCost(), {
      wrapper,
    });

    await expect(result.current.mutateAsync([])).rejects.toThrow();
    expect(
      queryClient.getQueryState(["recurringCosts", "all"])?.isInvalidated,
    ).toBe(true);
  });
});

describe("QueryProvider の既定値", () => {
  it("書き込み（mutation）は既定で再実行しない", () => {
    const { result } = renderHook(() => useQueryClient(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryProvider>{children}</QueryProvider>
      ),
    });

    expect(result.current.getDefaultOptions().mutations?.retry).toBe(0);
  });
});
