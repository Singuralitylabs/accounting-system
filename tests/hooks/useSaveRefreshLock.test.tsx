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

// 経理追加収支・定期費用の両画面が共有するロック条件（Issue #190）
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

    // 実際の画面では、保存フックの onSuccess が一覧を無効化してから保存結果を記録する
    rerender({ ...base, isInvalidated: true });
    act(() => result.current.markSaved("saved"));
    expect(result.current.outcome).toBe("saved");

    rerender({ ...base, isInvalidated: false });
    expect(result.current.outcome).toBeNull();
    // 待ち状態は終わっているので、後の別の無効化を保存後の待ちと取り違えない
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
    // 対象が違っても、無効化されている間のロック自体は変わらない
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
