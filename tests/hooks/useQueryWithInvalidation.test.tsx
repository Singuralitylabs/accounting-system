// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQueryWithInvalidation } from "@/app/hooks/useQueryWithInvalidation";

// isInvalidated は queryCache を購読して返す（Issue #189）。再取得を伴わない無効化
// （refetchType: "none"）でも再描画されることを固定する
describe("useQueryWithInvalidation", () => {
  let queryClient: QueryClient;
  const queryFn = vi.fn();
  const queryKey = ["test", "list"];

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const renderList = () =>
    renderHook(
      () =>
        useQueryWithInvalidation({
          queryKey,
          queryFn,
          staleTime: 60 * 1000,
        }),
      { wrapper },
    );

  beforeEach(() => {
    vi.clearAllMocks();
    queryFn.mockResolvedValue(["a"]);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnMount: false } },
    });
  });

  it("無効化しただけ（再取得しない）でも再描画されて isInvalidated が true になる", async () => {
    const { result } = renderList();
    await waitFor(() => expect(result.current.data).toEqual(["a"]));
    expect(result.current.isInvalidated).toBe(false);
    queryFn.mockClear();

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey, refetchType: "none" });
    });

    expect(queryFn).not.toHaveBeenCalled();
    expect(result.current.isInvalidated).toBe(true);
  });

  it("再取得に成功すると isInvalidated が false に戻る", async () => {
    const { result } = renderList();
    await waitFor(() => expect(result.current.data).toEqual(["a"]));
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey, refetchType: "none" });
    });
    expect(result.current.isInvalidated).toBe(true);

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.isInvalidated).toBe(false);
  });

  it("再取得に失敗した間は isInvalidated が true のまま残る", async () => {
    const { result } = renderList();
    await waitFor(() => expect(result.current.data).toEqual(["a"]));
    queryFn.mockRejectedValue(new Error("fail"));

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isInvalidated).toBe(true);
  });

  it("無効化された一覧は、開き直したとき（マウント時）に取り直す", async () => {
    queryClient.setQueryData(queryKey, ["old"]);
    await queryClient.invalidateQueries({ queryKey, refetchType: "none" });

    const { result } = renderList();

    await waitFor(() => expect(result.current.data).toEqual(["a"]));
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(result.current.isInvalidated).toBe(false);
  });

  it("無効化されていない新鮮な一覧は、マウント時に取り直さない", async () => {
    queryClient.setQueryData(queryKey, ["cached"]);

    const { result } = renderList();

    expect(result.current.data).toEqual(["cached"]);
    expect(queryFn).not.toHaveBeenCalled();
  });
});
