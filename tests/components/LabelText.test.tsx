// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LabelText from "@/app/components/LabelText";
import { renderWithMantine } from "../testUtils/renderWithMantine";

describe("LabelText", () => {
  it("値がある場合はラベルと値を表示する", () => {
    renderWithMantine(<LabelText label="取引先名">株式会社テスト</LabelText>);

    expect(screen.getByText("取引先名")).toBeInTheDocument();
    expect(screen.getByText("株式会社テスト")).toBeInTheDocument();
  });

  it("値が空文字の場合は「未設定」を表示する", () => {
    renderWithMantine(<LabelText label="取引先名">{""}</LabelText>);

    expect(screen.getByText("取引先名")).toBeInTheDocument();
    expect(screen.getByText("未設定")).toBeInTheDocument();
  });

  it("値が null の場合は「未設定」を表示する", () => {
    renderWithMantine(<LabelText label="品目">{null}</LabelText>);

    expect(screen.getByText("品目")).toBeInTheDocument();
    expect(screen.getByText("未設定")).toBeInTheDocument();
  });
});
