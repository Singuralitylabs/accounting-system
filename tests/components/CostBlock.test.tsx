// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CostBlock from "@/app/components/CostBlock";
import { CostType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const sampleCost: CostType = {
  id: 1,
  name: "会場費",
  item: "会場",
  payment_target: "株式会社テスト",
  price: 10000,
  period: "2026-04-01",
  certificate: "請求書",
  withholding: true,
  comment: null,
  inserted_at: "2026-01-01T00:00:00+09:00",
  updated_at: "2026-01-01T00:00:00+09:00",
  is_completed: false,
  matter_id: 10,
};

describe("CostBlock variant=user", () => {
  const userProps = {
    variant: "user" as const,
    costInfo: sampleCost,
    itemList: ["会場", "交通費"],
    certificateList: ["請求書", "領収書"],
    formType: "card",
    index: 0,
    onRemoveCost: vi.fn(),
    onCostUpdate: vi.fn(),
  };

  it("一般向けの入力欄と削除ボタンを出し、経理の支払い完了は出さない", () => {
    renderWithMantine(<CostBlock {...userProps} />);

    expect(screen.getByRole("textbox", { name: "コスト名" })).toHaveValue(
      "会場費",
    );
    expect(screen.getByRole("textbox", { name: "支払い先" })).toHaveValue(
      "株式会社テスト",
    );
    expect(
      screen.getByPlaceholderText("金額をご記入ください。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "品目" })).toHaveValue("会場");
    expect(screen.getByRole("textbox", { name: "通知方法" })).toHaveValue(
      "請求書",
    );
    expect(screen.getByText("支払い期限")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "源泉徴収あり" }),
    ).toBeChecked();
    expect(
      screen.getAllByRole("button", { name: "コストを削除" }),
    ).not.toHaveLength(0);

    expect(
      screen.queryByRole("checkbox", { name: "支払い済み" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("支払い完了")).not.toBeInTheDocument();
    expect(screen.queryByText("申請方法")).not.toBeInTheDocument();
    expect(screen.queryByText("価格")).not.toBeInTheDocument();
  });

  it("申請済み（isFixed）かつ既存行は入力と削除を無効化する", () => {
    renderWithMantine(<CostBlock {...userProps} isFixed />);

    expect(screen.getByRole("textbox", { name: "コスト名" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "コストを削除" }),
    ).not.toBeInTheDocument();
  });
});

describe("CostBlock variant=accounting", () => {
  const accountingProps = {
    variant: "accounting" as const,
    cost: sampleCost,
    costList: [sampleCost],
    setCostList: vi.fn(),
    isCompleted: false,
  };

  it("経理向けの閲覧表示と支払い完了を出し、一般向けの入力・削除は出さない", () => {
    renderWithMantine(<CostBlock {...accountingProps} />);

    expect(screen.getByLabelText("コスト")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "支払い済み" }),
    ).not.toBeDisabled();
    expect(screen.getByText("支払い完了")).toBeInTheDocument();
    expect(screen.getByText("価格")).toBeInTheDocument();
    expect(screen.getByText("￥10,000")).toBeInTheDocument();
    expect(screen.getByText("申請方法")).toBeInTheDocument();
    expect(screen.getByText("請求書")).toBeInTheDocument();
    expect(screen.getByText("あり")).toBeInTheDocument();

    expect(
      screen.queryByRole("textbox", { name: "コスト名" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("金額をご記入ください。"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "通知方法" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "源泉徴収あり" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "コストを削除" }),
    ).not.toBeInTheDocument();
  });

  it("案件が確認完了なら支払い完了チェックを無効化する", () => {
    renderWithMantine(<CostBlock {...accountingProps} isCompleted />);

    expect(screen.getByRole("checkbox", { name: "支払い済み" })).toBeDisabled();
  });
});
