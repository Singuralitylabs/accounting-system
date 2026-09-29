// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { deleteBudgetDeclaration, saveBudgetDeclaration } = vi.hoisted(() => ({
  deleteBudgetDeclaration: vi.fn(),
  saveBudgetDeclaration: vi.fn(),
}));

vi.mock("@/app/utils/supabase/budgetDeclarations", () => ({
  deleteBudgetDeclaration,
  saveBudgetDeclaration,
}));
vi.mock("@/app/utils/notify", () =>
  import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
);

import {
  useDeleteBudgetDeclaration,
  useSaveBudgetDeclaration,
} from "@/app/hooks/useBudgetDeclarationData";
import { notifyError, notifySuccess } from "@/app/utils/notify";

// Pins a silent failure where list/detail caches diverge from the real state after a delete failure.
// Component tests mock useDeleteBudgetDeclaration, so only this test exercises it
// (docs/testing.md 2.5).
describe("useDeleteBudgetDeclaration", () => {
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
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("削除エラー時も一覧・詳細のキャッシュを無効化する（先行削除で 0 行エラーになっても表示が残らない）", async () => {
    queryClient.setQueryData(["budgetDeclarations", "list", "2026-10"], []);
    queryClient.setQueryData(["budgetDeclarations", "detail", 7], {
      comment: null,
      items: [],
    });
    deleteBudgetDeclaration.mockResolvedValue({
      error: {
        kind: "fetchFailed",
        message: "事前収支申告の削除対象が見つかりませんでした。",
      },
    });

    const { result } = renderHook(() => useDeleteBudgetDeclaration(), {
      wrapper,
    });

    await expect(
      result.current.mutateAsync({ declarationId: 7, team: "Aチーム" }),
    ).rejects.toThrow();

    // list is invalidated by prefix match on ["budgetDeclarations", "list"]; check that the real key
    // (which includes the month) is invalidated.
    await waitFor(() => {
      expect(
        queryClient.getQueryState(["budgetDeclarations", "detail", 7])
          ?.isInvalidated,
      ).toBe(true);
      expect(
        queryClient.getQueryState(["budgetDeclarations", "list", "2026-10"])
          ?.isInvalidated,
      ).toBe(true);
    });
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith(
      "事前収支申告の削除対象が見つかりませんでした。",
    );
  });

  it("削除成功時は詳細を破棄し一覧を無効化する", async () => {
    queryClient.setQueryData(["budgetDeclarations", "list", "2026-10"], []);
    queryClient.setQueryData(["budgetDeclarations", "detail", 7], {
      comment: null,
      items: [],
    });
    deleteBudgetDeclaration.mockResolvedValue({});

    const { result } = renderHook(() => useDeleteBudgetDeclaration(), {
      wrapper,
    });

    await result.current.mutateAsync({ declarationId: 7, team: "Aチーム" });

    expect(
      queryClient
        .getQueryCache()
        .find({ queryKey: ["budgetDeclarations", "detail", 7], exact: true }),
    ).toBeUndefined();
    expect(
      queryClient.getQueryState(["budgetDeclarations", "list", "2026-10"])
        ?.isInvalidated,
    ).toBe(true);
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });
});

describe("useSaveBudgetDeclaration", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("新規作成の失敗時は一覧だけ無効化し、detail の null キーは作らない", async () => {
    queryClient.setQueryData(["budgetDeclarations", "list", "2026-10"], []);
    queryClient.setQueryData(["budgetDeclarations", "detail", 7], {
      comment: null,
      items: [],
    });
    saveBudgetDeclaration.mockResolvedValue({
      error: {
        kind: "duplicate",
        message: "同じ対象月・チームの事前収支申告が既に存在します。",
      },
    });

    const { result } = renderHook(() => useSaveBudgetDeclaration(), {
      wrapper,
    });

    await expect(
      result.current.mutateAsync({
        declarationId: null,
        targetMonth: "2026-10",
        team: "Aチーム",
        comment: null,
        items: [],
      }),
    ).rejects.toThrow();

    await waitFor(() => {
      expect(
        queryClient.getQueryState(["budgetDeclarations", "list", "2026-10"])
          ?.isInvalidated,
      ).toBe(true);
    });
    expect(
      queryClient.getQueryState(["budgetDeclarations", "detail", 7])
        ?.isInvalidated,
    ).toBeFalsy();
    expect(
      queryClient.getQueryCache().find({
        queryKey: ["budgetDeclarations", "detail", null],
        exact: true,
      }),
    ).toBeUndefined();
    expect(notifyError).toHaveBeenCalledWith(
      "同じ対象月・チームの事前収支申告が既に存在します。",
    );
  });
});
