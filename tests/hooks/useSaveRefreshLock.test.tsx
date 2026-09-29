// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSaveRefreshLock } from "@/app/hooks/useSaveRefreshLock";

const base = {
  isInvalidated: false,
  isFetching: false,
  isError: false,
  isPaused: false,
};

// Lock condition shared by the extra-entry and recurring-cost screens.
describe("useSaveRefreshLock", () => {
  it("無効化されていなければロックしない", () => {
    const { result } = renderHook(() => useSaveRefreshLock(base));
    expect(result.current.locked).toBe(false);
    expect(result.current.isStalled).toBe(false);
    expect(result.current.outcome).toBeNull();
  });

  it("無効化されている間は、再取得中でもロックする（取得済みでない一覧で編集させない）", () => {
    const { result } = renderHook(() =>
      useSaveRefreshLock({ ...base, isInvalidated: true, isFetching: true }),
    );
    expect(result.current.locked).toBe(true);
    expect(result.current.isStalled).toBe(false);
  });

  it.each([
    ["取得に失敗", { isError: true }],
    ["オフラインで一時停止", { isPaused: true }],
  ])("無効化されたまま%sしたら、ロックして案内を出す", (_label, extra) => {
    const { result } = renderHook(() =>
      useSaveRefreshLock({ ...base, isInvalidated: true, ...extra }),
    );
    expect(result.current.locked).toBe(true);
    expect(result.current.isStalled).toBe(true);
  });

  it("再取得中は（失敗の履歴があっても）案内を出さない", () => {
    const { result } = renderHook(() =>
      useSaveRefreshLock({
        ...base,
        isInvalidated: true,
        isFetching: true,
        isError: true,
      }),
    );
    expect(result.current.isStalled).toBe(false);
  });

  it("保存後は、無効化が解けるまで保存結果を返し、解けたら消える", () => {
    type P = Parameters<typeof useSaveRefreshLock>[0];
    const { result, rerender } = renderHook(
      (props: P) => useSaveRefreshLock(props),
      { initialProps: base as P },
    );

    // In the real screens, the save hook's onSuccess invalidates the list, then records the save result.
    rerender({ ...base, isInvalidated: true });
    act(() => result.current.markSaved("saved"));
    expect(result.current.outcome).toBe("saved");

    rerender({ ...base, isInvalidated: false });
    expect(result.current.outcome).toBeNull();
    // Pending state is over, so a later unrelated invalidation is not mistaken for post-save waiting.
    rerender({ ...base, isInvalidated: true });
    expect(result.current.outcome).toBeNull();
  });

  it("保存できたか分からない結果（unknown）を返す", () => {
    const props = { ...base, isInvalidated: true };
    const { result } = renderHook(() => useSaveRefreshLock(props));
    act(() => result.current.markSaved("unknown"));
    expect(result.current.outcome).toBe("unknown");
  });

  it("保存した対象（月）と違う対象を表示している間は、保存結果を返さない", () => {
    type P = Parameters<typeof useSaveRefreshLock>[0];
    const invalidated = { ...base, isInvalidated: true };
    const { result, rerender } = renderHook(
      (props: P) => useSaveRefreshLock(props),
      { initialProps: { ...invalidated, scope: "2026-09" } as P },
    );
    act(() => result.current.markSaved("saved"));
    expect(result.current.outcome).toBe("saved");

    rerender({ ...invalidated, scope: "2026-10" });
    expect(result.current.outcome).toBeNull();
    expect(result.current.locked).toBe(true);
  });

  it("reset で保存後の待ち状態を解く", () => {
    const props = { ...base, isInvalidated: true };
    const { result } = renderHook(() => useSaveRefreshLock(props));
    act(() => result.current.markSaved("saved"));
    act(() => result.current.reset());
    expect(result.current.outcome).toBeNull();
  });
});
