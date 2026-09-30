// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomMonthPicker } from "@/app/components/CustomMonthPicker";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const renderPicker = (
  props: Partial<React.ComponentProps<typeof CustomMonthPicker>> = {},
) => {
  const onChange = vi.fn();
  renderWithMantine(
    <CustomMonthPicker
      label="対象月"
      placeholder="対象月を選択"
      value="2026-08"
      onChange={onChange}
      withNavigation
      {...props}
    />,
  );
  return onChange;
};

describe("CustomMonthPicker の前月・翌月ボタン", () => {
  it("前月ボタンで1か月前の月を onChange に渡す", () => {
    const onChange = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "前月" }));
    expect(onChange).toHaveBeenCalledWith("2026-07");
  });

  it("翌月ボタンで1か月後の月を onChange に渡す", () => {
    const onChange = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "翌月" }));
    expect(onChange).toHaveBeenCalledWith("2026-09");
  });

  it("年初の前月は前年12月になる", () => {
    const onChange = renderPicker({ value: "2026-01" });
    fireEvent.click(screen.getByRole("button", { name: "前月" }));
    expect(onChange).toHaveBeenCalledWith("2025-12");
  });

  it("年末の翌月は翌年1月になる", () => {
    const onChange = renderPicker({ value: "2025-12" });
    fireEvent.click(screen.getByRole("button", { name: "翌月" }));
    expect(onChange).toHaveBeenCalledWith("2026-01");
  });

  it("title に遷移先の月を表示する", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: "前月" })).toHaveAttribute(
      "title",
      "2026年7月",
    );
    expect(screen.getByRole("button", { name: "翌月" })).toHaveAttribute(
      "title",
      "2026年9月",
    );
  });

  it("value が null のときは両ボタンが無効になる", () => {
    renderPicker({ value: null });
    expect(screen.getByRole("button", { name: "前月" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "翌月" })).toBeDisabled();
  });

  it("disabled のときは両ボタンが無効になる", () => {
    renderPicker({ disabled: true });
    expect(screen.getByRole("button", { name: "前月" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "翌月" })).toBeDisabled();
  });

  it("withNavigation 未指定ではボタンを表示しない", () => {
    renderPicker({ withNavigation: undefined });
    expect(screen.queryByRole("button", { name: "前月" })).toBeNull();
    expect(screen.queryByRole("button", { name: "翌月" })).toBeNull();
  });
});
