// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CompactLoader,
  LoadingSpinner,
  ModalLoadingFallback,
} from "@/app/components/LoadingSpinner";
import { renderWithMantine } from "../testUtils/renderWithMantine";

describe("LoadingSpinner", () => {
  it("h-64 枠内に status ロールと aria-label を付けて描画する", () => {
    const { container } = renderWithMantine(<LoadingSpinner />);

    const status = screen.getByRole("status", { name: "読み込み中" });
    expect(status).toBeInTheDocument();
    expect(status).toHaveClass("h-64");
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(status.querySelector(".mantine-Loader-root")).not.toBeNull();
  });
});

describe("CompactLoader", () => {
  it("ヘッダー向けの小さな status ローダーを描画する", () => {
    renderWithMantine(<CompactLoader color="gray.0" />);

    expect(
      screen.getByRole("status", { name: "読み込み中" }),
    ).toBeInTheDocument();
  });
});

describe("ModalLoadingFallback", () => {
  it("h-64 の枠を使わず画面中央に固定表示する", () => {
    const { container } = renderWithMantine(<ModalLoadingFallback />);

    const status = screen.getByRole("status", { name: "読み込み中" });
    expect(status).toBeInTheDocument();
    expect(status).toHaveClass("fixed", "inset-0");
    expect(status).not.toHaveClass("h-64");
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(status.querySelector(".mantine-Loader-root")).not.toBeNull();
  });
});
