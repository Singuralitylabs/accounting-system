// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BusinessBlock from "@/app/components/BusinessBlock";
import { BusinessType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const sampleBusiness: BusinessType = {
  id: 1,
  name: "株式会社テスト",
  amount: 50000,
  invoice_date: "2026-04-01",
  period_date: "2026-04-30",
  is_completed: false,
  matter_id: 10,
  inserted_at: "2026-01-01T00:00:00+09:00",
  updated_at: "2026-01-01T00:00:00+09:00",
};

describe("BusinessBlock variant=user", () => {
  const userProps = {
    variant: "user" as const,
    businessInfo: sampleBusiness,
    formType: "card",
    index: 0,
    onRemoveBusiness: vi.fn(),
    onBusinessUpdate: vi.fn(),
  };

  it("一般向けの入力欄と削除ボタンを出し、経理の確認完了は出さない", () => {
    renderWithMantine(<BusinessBlock {...userProps} />);

    expect(screen.getByRole("textbox", { name: "取引先名" })).toHaveValue(
      "株式会社テスト",
    );
    expect(
      screen.getByPlaceholderText("報酬額をご記入ください。"),
    ).toBeInTheDocument();
    expect(screen.getByText("請求日")).toBeInTheDocument();
    expect(screen.getByText("振込期限")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "取引先を削除" }),
    ).not.toHaveLength(0);

    expect(
      screen.queryByRole("checkbox", { name: "受取済み" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("確認完了")).not.toBeInTheDocument();
    expect(screen.queryByText("請求額")).not.toBeInTheDocument();
  });

  it("申請済み（isFixed）かつ既存行は入力と削除を無効化する", () => {
    renderWithMantine(<BusinessBlock {...userProps} isFixed />);

    expect(screen.getByRole("textbox", { name: "取引先名" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "取引先を削除" }),
    ).not.toBeInTheDocument();
  });
});

describe("BusinessBlock variant=accounting", () => {
  const accountingProps = {
    variant: "accounting" as const,
    business: sampleBusiness,
    businessList: [sampleBusiness],
    setBusinessList: vi.fn(),
    isCompleted: false,
  };

  it("経理向けの閲覧表示と確認完了を出し、一般向けの入力・削除は出さない", () => {
    renderWithMantine(<BusinessBlock {...accountingProps} />);

    expect(screen.getByLabelText("取引先")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "受取済み" }),
    ).not.toBeDisabled();
    expect(screen.getByText("確認完了")).toBeInTheDocument();
    expect(screen.getByText("請求額")).toBeInTheDocument();
    expect(screen.getByText("￥50,000")).toBeInTheDocument();
    expect(screen.getByText("株式会社テスト")).toBeInTheDocument();

    expect(
      screen.queryByRole("textbox", { name: "取引先名" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("報酬額をご記入ください。"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "取引先を削除" }),
    ).not.toBeInTheDocument();
  });

  it("案件が確認完了なら受取済みチェックを無効化する", () => {
    renderWithMantine(<BusinessBlock {...accountingProps} isCompleted />);

    expect(screen.getByRole("checkbox", { name: "受取済み" })).toBeDisabled();
  });
});
