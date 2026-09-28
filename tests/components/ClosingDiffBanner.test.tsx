// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ClosingDiffBanner from "@/app/components/profitLoss/ClosingDiffBanner";
import {
  closingDiffScopeMessage,
  isBeforeDiffScope,
  isClosedMonthBeforeDiffScope,
} from "@/app/components/profitLoss/ClosingDiffScopeNote";
import { renderWithMantine } from "../testUtils/renderWithMantine";

describe("ClosingDiffBanner（Issue #149 / #172）", () => {
  const summary = [
    { month: "2026-08", count: 3 },
    { month: "2026-09", count: 1 },
  ];

  it("未処理の差分がある月と件数を表示し、月名で月次タブのその月へ切り替える", () => {
    const onSelectMonth = vi.fn();
    renderWithMantine(
      <ClosingDiffBanner summary={summary} onSelectMonth={onSelectMonth} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "2026年9月（1件）" }));
    expect(onSelectMonth).toHaveBeenCalledWith("2026-09");
    // 対象範囲より前の確定済みの月が無ければ（scopeFromMonth なし）注記しない
    expect(screen.queryByText(/確定後の変更の目印は/)).not.toBeInTheDocument();
  });

  it("対象範囲より前の確定済みの月があるとき（scopeFromMonth あり）は対象範囲を注記する", () => {
    renderWithMantine(
      <ClosingDiffBanner
        summary={summary}
        onSelectMonth={vi.fn()}
        scopeFromMonth="2024-10"
      />,
    );
    expect(
      screen.getByText(
        "確定後の変更の目印は 2024年10月以降の確定済みの月が対象です（それより前の月は月次タブで開くと差分を確認できます）",
      ),
    ).toBeInTheDocument();
  });

  it("未処理の差分が無ければ何も表示しない", () => {
    renderWithMantine(
      <ClosingDiffBanner
        summary={[]}
        onSelectMonth={vi.fn()}
        scopeFromMonth="2024-10"
      />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/確定後の変更の目印は/)).not.toBeInTheDocument();
  });
});

describe("isBeforeDiffScope / isClosedMonthBeforeDiffScope（目印の対象範囲外の判定。Issue #172）", () => {
  it("isBeforeDiffScope: 件数集計の対象の開始月より前の月だけ true（開始月そのものは対象内）", () => {
    expect(isBeforeDiffScope("2024-09", "2024-10")).toBe(true);
    expect(isBeforeDiffScope("2024-10", "2024-10")).toBe(false);
    expect(isBeforeDiffScope("2024-11", "2024-10")).toBe(false);
    // 年をまたいでも "YYYY-MM" の文字列比較で判定できる
    expect(isBeforeDiffScope("2023-12", "2024-01")).toBe(true);
  });

  it("isClosedMonthBeforeDiffScope: 確定済みで、対象の開始月より前の月だけ true", () => {
    expect(isClosedMonthBeforeDiffScope("2024-09", true, "2024-10")).toBe(true);
    // 開始月そのもの・未確定の月は対象外
    expect(isClosedMonthBeforeDiffScope("2024-10", true, "2024-10")).toBe(
      false,
    );
    expect(isClosedMonthBeforeDiffScope("2024-08", false, "2024-10")).toBe(
      false,
    );
  });

  it("開始月が分からない（集計の取得前・失敗時）なら注記しない", () => {
    expect(isBeforeDiffScope("2024-09", undefined)).toBe(false);
    expect(isClosedMonthBeforeDiffScope("2024-09", true, undefined)).toBe(
      false,
    );
  });

  it("注記の文言は開始月を「YYYY年M月」で示す", () => {
    expect(closingDiffScopeMessage("2024-10")).toBe(
      "確定後の変更の目印は 2024年10月以降の確定済みの月が対象です（それより前の月は月次タブで開くと差分を確認できます）",
    );
  });
});
