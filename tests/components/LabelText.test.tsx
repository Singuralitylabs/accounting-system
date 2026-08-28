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

  it("長い値でも隣の項目に重ならないよう折り返しクラスを持つ", () => {
    const longValue =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789supercalifragilisticexpialidocious";
    renderWithMantine(<LabelText label="取引先名">{longValue}</LabelText>);

    expect(screen.getByText(longValue)).toHaveClass("break-words");
  });

  it("isCurrency で金額が 0 の場合は「未設定」ではなく￥0を表示する", () => {
    renderWithMantine(
      <LabelText label="請求額" isCurrency>
        {0}
      </LabelText>,
    );

    expect(screen.getByText("￥0")).toBeInTheDocument();
    expect(screen.queryByText("未設定")).not.toBeInTheDocument();
  });

  it("isDate で値が null の場合は日付変換せず「未設定」を表示する", () => {
    renderWithMantine(
      <LabelText label="案件開始日" isDate>
        {null}
      </LabelText>,
    );

    expect(screen.getByText("未設定")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
