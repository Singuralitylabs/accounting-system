// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SaveRefreshAlert } from "@/app/components/SaveRefreshAlert";
import { renderWithMantine } from "../testUtils/renderWithMantine";

describe("SaveRefreshAlert", () => {
  it.each([
    ["saved", "保存は完了しましたが、最新の一覧を取得できませんでした"],
    ["unknown", "保存できたか確認できず、最新の一覧も取得できませんでした"],
    [null, "最新の一覧を取得できませんでした"],
  ] as const)("保存結果 %s の見出しを出す", (outcome, title) => {
    renderWithMantine(
      <SaveRefreshAlert
        subject="一覧"
        outcome={outcome}
        isPaused={false}
        onReload={() => {}}
      />,
    );
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.queryByText(/通信が回復すると/)).toBeNull();
  });

  it("オフラインの一時停止中は自動取得の案内を出し、「再読み込み」で onReload を呼ぶ", () => {
    const onReload = vi.fn();
    renderWithMantine(
      <SaveRefreshAlert
        subject="一覧"
        outcome={null}
        isPaused
        onReload={onReload}
      />,
    );
    expect(screen.getByText(/通信が回復すると自動で取得します/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
