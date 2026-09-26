// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ClosedMonthMatterNotice from "@/app/components/modal/matterDetail/ClosedMonthMatterNotice";
import { renderWithMantine } from "../testUtils/renderWithMantine";

vi.mock("@/app/hooks/useClosedMonths", () => ({
  useClosedMonths: () => ({ closedMonths: new Set(["2026-08", "2026-10"]) }),
}));

describe("ClosedMonthMatterNotice", () => {
  it("保存済み・入力中の開始日が確定済みの月なら注意表示を出す", () => {
    renderWithMantine(
      <ClosedMonthMatterNotice
        savedStartDate="2026-08-10"
        currentStartDate="2026-10-01"
      />,
    );
    expect(
      screen.getByText(/確定済みの月（2026年8月 \/ 2026年10月）/),
    ).toBeInTheDocument();
  });

  it("どちらも確定済みでなければ何も表示しない", () => {
    renderWithMantine(
      <ClosedMonthMatterNotice
        savedStartDate="2026-09-10"
        currentStartDate={null}
      />,
    );
    expect(
      screen.queryByText("確定済みの月の案件です"),
    ).not.toBeInTheDocument();
  });
});
