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
});
