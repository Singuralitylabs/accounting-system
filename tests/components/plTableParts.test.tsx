// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useExpandedRows } from "@/app/components/profitLoss/plTableParts";

describe("useExpandedRows", () => {
  it("expandAll / collapseAll は渡したキーだけを開閉し、他の行の展開状態を変えない（Issue #152）", () => {
    const { result } = renderHook(() => useExpandedRows());

    act(() => result.current.toggleRow("item-通信費"));
    act(() => result.current.expandAll(["matter-12", "matter-15"]));
    expect(Array.from(result.current.expandedRows).sort()).toEqual([
      "item-通信費",
      "matter-12",
      "matter-15",
    ]);

    act(() => result.current.collapseAll(["matter-12", "matter-15"]));
    expect(Array.from(result.current.expandedRows)).toEqual(["item-通信費"]);

    act(() => result.current.collapseAll(["item-通信費"]));
    expect(result.current.expandedRows.size).toBe(0);
  });

  it("initialKeys の行を初期表示で開き、閉じた後は再レンダーしても開き直さない（Issue #164）", () => {
    const { result, rerender } = renderHook(
      ({ initialKeys }: { initialKeys: string[] }) =>
        useExpandedRows(initialKeys),
      { initialProps: { initialKeys: ["gross:matter"] } },
    );
    expect(Array.from(result.current.expandedRows)).toEqual(["gross:matter"]);

    // 初期表示で開いた行もトグル・collapseAll で閉じられる
    act(() => result.current.toggleRow("gross:matter"));
    expect(result.current.expandedRows.has("gross:matter")).toBe(false);
    act(() => result.current.expandAll(["gross:matter", "recurring:通信費"]));
    act(() => result.current.collapseAll(["gross:matter"]));
    expect(Array.from(result.current.expandedRows)).toEqual([
      "recurring:通信費",
    ]);

    // 初期値は初回だけ使う（再レンダーで initialKeys を渡し直しても状態を上書きしない）
    rerender({ initialKeys: ["gross:matter"] });
    expect(result.current.expandedRows.has("gross:matter")).toBe(false);
  });

  it("initialKeys を省略すると全行閉じた状態で始まる", () => {
    const { result } = renderHook(() => useExpandedRows());
    expect(result.current.expandedRows.size).toBe(0);
  });
});
