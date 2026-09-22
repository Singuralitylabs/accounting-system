// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useListPagination } from "@/app/hooks/useListPagination";

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

describe("useListPagination", () => {
  it("ページサイズ以下の件数では全件表示しページネーションUIは不要", () => {
    const { result } = renderHook(() => useListPagination(items(2)));
    expect(result.current.pagedItems.map((item) => item.id)).toEqual([1, 2]);
    expect(result.current.showPagination).toBe(false);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.startIndex).toBe(1);
    expect(result.current.endIndex).toBe(2);
  });

  it("件数が多い場合は1ページ分だけ切り出す（導入前は全件レンダリングだった分を削減）", () => {
    const { result } = renderHook(() => useListPagination(items(30)));
    expect(result.current.total).toBe(30);
    expect(result.current.totalPages).toBe(2);
    expect(result.current.pagedItems).toHaveLength(24);
    expect(result.current.showPagination).toBe(true);
    expect(result.current.startIndex).toBe(1);
    expect(result.current.endIndex).toBe(24);
  });

  it("ページ切替で表示範囲が変わる", () => {
    const { result } = renderHook(() => useListPagination(items(30)));
    act(() => {
      result.current.setPage(2);
    });
    expect(result.current.page).toBe(2);
    expect(result.current.pagedItems.map((item) => item.id)).toEqual([
      25, 26, 27, 28, 29, 30,
    ]);
    expect(result.current.startIndex).toBe(25);
    expect(result.current.endIndex).toBe(30);
  });

  it("範囲外のページは最終ページに丸める", () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: { id: number }[] }) => useListPagination(list),
      { initialProps: { list: items(50) } },
    );
    act(() => {
      result.current.setPage(3);
    });
    expect(result.current.page).toBe(3);
    rerender({ list: items(10) });
    expect(result.current.page).toBe(1);
    expect(result.current.pagedItems).toHaveLength(10);
  });

  it("件数減少で最終ページが変わっても丸めで表示する（1ページ目へのリセットではない）", () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: { id: number }[] }) => useListPagination(list),
      { initialProps: { list: items(50) } },
    );
    act(() => {
      result.current.setPage(3);
    });
    rerender({ list: items(30) });
    // 30件では最終2ページ。件数変動ではリセットせず丸める
    expect(result.current.page).toBe(2);
    expect(result.current.pagedItems.map((item) => item.id)).toEqual([
      25, 26, 27, 28, 29, 30,
    ]);
  });

  it("件数がページサイズちょうどではページネーションUIは不要", () => {
    const { result } = renderHook(() => useListPagination(items(24)));
    expect(result.current.showPagination).toBe(false);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.pagedItems).toHaveLength(24);
  });

  it("表示件数の変更後は1ページ目に戻る", () => {
    const { result } = renderHook(() => useListPagination(items(30)));
    act(() => {
      result.current.setPage(2);
    });
    expect(result.current.page).toBe(2);
    act(() => {
      result.current.setPerPage(12);
    });
    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(3);
  });

  it("フィルタ条件（resetKey）が変わったら1ページ目に戻る", () => {
    const { result, rerender } = renderHook(
      ({ resetKey }: { resetKey: string }) =>
        useListPagination(items(30), { resetKey }),
      { initialProps: { resetKey: "{}" } },
    );
    act(() => {
      result.current.setPage(2);
    });
    expect(result.current.page).toBe(2);
    rerender({ resetKey: '{"team":["開発"]}' });
    expect(result.current.page).toBe(1);
  });

  it("表示件数の変更でページ分割が変わる", () => {
    const { result } = renderHook(() => useListPagination(items(30)));
    act(() => {
      result.current.setPerPage(12);
    });
    expect(result.current.totalPages).toBe(3);
    expect(result.current.pagedItems).toHaveLength(12);
    expect(result.current.page).toBe(1);
  });
});
