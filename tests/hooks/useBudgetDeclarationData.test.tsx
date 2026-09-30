// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  deleteBudgetDeclaration,
  saveBudgetDeclaration,
  closeBudgetDeclarationMonth,
  reopenBudgetDeclarationMonth,
  getBudgetDeclarationClosings,
} = vi.hoisted(() => ({
  getBudgetDeclarationClosings: vi.fn(),
  deleteBudgetDeclaration: vi.fn(),
  saveBudgetDeclaration: vi.fn(),
  closeBudgetDeclarationMonth: vi.fn(),
  reopenBudgetDeclarationMonth: vi.fn(),
}));

vi.mock("@/app/utils/supabase/budgetDeclarationClosings", () => ({
  closeBudgetDeclarationMonth,
  reopenBudgetDeclarationMonth,
  getBudgetDeclarationClosings,
}));

vi.mock("@/app/utils/supabase/budgetDeclarations", () => ({
  deleteBudgetDeclaration,
  saveBudgetDeclaration,
}));
vi.mock("@/app/utils/notify", () =>
  import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
);

import {
  useBudgetClosings,
  useCloseBudgetDeclarationMonth,
  useReopenBudgetDeclarationMonth,
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
      completed: false,
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

  it("確定済みの月の削除が拒否されたら、確定状態のキャッシュも無効化する", async () => {
    queryClient.setQueryData(["budgetDeclarations", "closings"], []);
    deleteBudgetDeclaration.mockResolvedValue({
      error: {
        kind: "validationFailed",
        message:
          "この月の事前収支申告は確定済みのため、作成・編集・削除できません。",
      },
    });

    const { result } = renderHook(() => useDeleteBudgetDeclaration(), {
      wrapper,
    });

    await expect(
      result.current.mutateAsync({ declarationId: 7, team: "Aチーム" }),
    ).rejects.toThrow();

    await waitFor(() => {
      expect(
        queryClient.getQueryState(["budgetDeclarations", "closings"])
          ?.isInvalidated,
      ).toBe(true);
    });
  });

  it("削除成功時は詳細を破棄し一覧を無効化する", async () => {
    queryClient.setQueryData(["budgetDeclarations", "list", "2026-10"], []);
    queryClient.setQueryData(["budgetDeclarations", "detail", 7], {
      comment: null,
      completed: false,
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
      completed: false,
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
        completed: false,
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

  it("保存に成功したときは確定状態のキャッシュを無効化しない（余分な再取得を避ける）", async () => {
    queryClient.setQueryData(["budgetDeclarations", "closings"], []);
    saveBudgetDeclaration.mockResolvedValue({ id: 7 });

    const { result } = renderHook(() => useSaveBudgetDeclaration(), {
      wrapper,
    });

    await result.current.mutateAsync({
      declarationId: null,
      targetMonth: "2026-10",
      team: "Aチーム",
      comment: null,
      completed: false,
      items: [],
    });

    await waitFor(() => expect(notifySuccess).toHaveBeenCalled());
    expect(
      queryClient.getQueryState(["budgetDeclarations", "closings"])
        ?.isInvalidated,
    ).toBeFalsy();
  });

  it("確定済みの月への保存が拒否されたら、確定状態のキャッシュも無効化する（画面を開いたまま確定された場合に編集ボタンが残らない）", async () => {
    queryClient.setQueryData(["budgetDeclarations", "closings"], []);
    saveBudgetDeclaration.mockResolvedValue({
      error: {
        kind: "validationFailed",
        message:
          "この月の事前収支申告は確定済みのため、作成・編集・削除できません。",
      },
    });

    const { result } = renderHook(() => useSaveBudgetDeclaration(), {
      wrapper,
    });

    await expect(
      result.current.mutateAsync({
        declarationId: 7,
        targetMonth: "2026-10",
        team: "Aチーム",
        comment: null,
        completed: false,
        items: [],
      }),
    ).rejects.toThrow();

    await waitFor(() => {
      expect(
        queryClient.getQueryState(["budgetDeclarations", "closings"])
          ?.isInvalidated,
      ).toBe(true);
    });
  });
});

describe("useCloseBudgetDeclarationMonth / useReopenBudgetDeclarationMonth", () => {
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

  it("確定に成功すると申告関連のキャッシュをすべて無効化する", async () => {
    closeBudgetDeclarationMonth.mockResolvedValue({});
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCloseBudgetDeclarationMonth(), {
      wrapper,
    });

    await result.current.mutateAsync("2026-10");

    expect(closeBudgetDeclarationMonth).toHaveBeenCalledWith("2026-10");
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["budgetDeclarations"],
    });
  });

  it("確定に失敗（他の経理が確定済み等）しても再取得のためキャッシュを無効化し、エラーを投げる", async () => {
    closeBudgetDeclarationMonth.mockResolvedValue({
      error: { kind: "validationFailed", message: "既に確定されています" },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCloseBudgetDeclarationMonth(), {
      wrapper,
    });

    await expect(result.current.mutateAsync("2026-10")).rejects.toThrow(
      "既に確定されています",
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["budgetDeclarations"],
      }),
    );
  });

  it("確定解除に失敗してもキャッシュを無効化する", async () => {
    reopenBudgetDeclarationMonth.mockResolvedValue({
      error: { kind: "fetchFailed", message: "解除に失敗しました" },
    });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useReopenBudgetDeclarationMonth(), {
      wrapper,
    });

    await expect(result.current.mutateAsync("2026-10")).rejects.toThrow(
      "解除に失敗しました",
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["budgetDeclarations"],
      }),
    );
  });
});

describe("useBudgetClosings", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {children}
    </QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("取得中は確定状態が不明（isUnknown）で、取得後は月ごとの確定情報を返す", async () => {
    getBudgetDeclarationClosings.mockResolvedValue({
      closings: [
        {
          month: "2026-10",
          closedAt: "2026-09-21T01:00:00Z",
          closedByName: "経理",
        },
      ],
    });

    const { result } = renderHook(() => useBudgetClosings(), { wrapper });

    expect(result.current.isUnknown).toBe(true);
    await waitFor(() => expect(result.current.isUnknown).toBe(false));
    expect(result.current.closingByMonth.get("2026-10")?.closedByName).toBe(
      "経理",
    );
  });

  it("取得に失敗して何も持たないときも isUnknown のまま（未確定扱いにしない）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getBudgetDeclarationClosings.mockResolvedValue({
      error: { kind: "fetchFailed", message: "失敗" },
    });

    const { result } = renderHook(() => useBudgetClosings(), { wrapper });

    await waitFor(() =>
      expect(getBudgetDeclarationClosings).toHaveBeenCalled(),
    );
    await waitFor(() => expect(result.current.closingByMonth.size).toBe(0));
    expect(result.current.isUnknown).toBe(true);
  });

  it("seed（initialData）があれば最初から確定状態を判定できる", () => {
    const { result } = renderHook(
      () =>
        useBudgetClosings(
          [{ month: "2026-10", closedAt: "x", closedByName: "経理" }],
          Date.now(),
        ),
      { wrapper },
    );

    expect(result.current.isUnknown).toBe(false);
    expect(result.current.closingByMonth.has("2026-10")).toBe(true);
  });
});
