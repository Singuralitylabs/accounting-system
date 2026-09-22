// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteBudgetDeclaration } = vi.hoisted(() => ({
  deleteBudgetDeclaration: vi.fn(),
}));

vi.mock("@/app/utils/supabase/budgetDeclarations", () => ({
  deleteBudgetDeclaration,
}));
vi.mock("@/app/utils/notify", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  toErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

import { useDeleteBudgetDeclaration } from "@/app/hooks/useBudgetDeclarationData";
import { notifyError, notifySuccess } from "@/app/utils/notify";

// 削除失敗時に一覧・詳細のキャッシュが実状態に合わなくなるサイレント障害
// （Issue #104）を固定する。既存のコンポーネントテストは
// useDeleteBudgetDeclaration をモックしているため、この挙動はここでしか
// 実行されない（docs/testing.md 2.5「サイレント障害につながる
// エラーハンドリングはテスト対象」）。
describe("useDeleteBudgetDeclaration", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    // フックの onError は console.error でログする。テスト出力を汚さない
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
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

    // list は ["budgetDeclarations", "list"] の前方一致で無効化されるため、
    // 実キー（月付き）が無効化されることを確認する
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
