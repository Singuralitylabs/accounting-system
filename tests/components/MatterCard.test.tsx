// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MatterCard } from "@/app/components/MatterCard";
import { MatterInfoWithUserNameType, MatterType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const sampleMatter: MatterType = {
  id: 42,
  title: "テスト案件",
  category: "セミナー",
  team: "開発",
  total_amount: 100000,
  total_cost: 20000,
  unchecked_cost_count: 2,
  has_updates: true,
  is_completed: false,
  is_fixed: true,
  inserted_at: "2026-01-15T00:00:00+09:00",
  updated_at: "2026-01-15T00:00:00+09:00",
  accounting_memo: null,
  business_count: 1,
  cost_count: 1,
  description: null,
  parent_matter_id: null,
  start_date: null,
  user_id: 1,
};

const sampleAccountingMatter: MatterInfoWithUserNameType = {
  ...sampleMatter,
  user_name: "山田太郎",
  slack_id: "U123",
};

describe("MatterCard variant=user", () => {
  const userProps = {
    variant: "user" as const,
    matter: sampleMatter,
    onOpen: vi.fn(),
    onCopy: vi.fn(),
    onDelete: vi.fn(),
  };

  it("一般向けの開くボタンと申請中バッジを出し、経理専用項目は出さない", () => {
    renderWithMantine(<MatterCard {...userProps} />);

    expect(screen.getByText("テスト案件")).toBeInTheDocument();
    expect(screen.getByText("経理申請中")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "開く" })).toBeInTheDocument();
    expect(screen.getByText("案件ID: 42")).toBeInTheDocument();
    expect(screen.getByText(/合計請求額:/)).toBeInTheDocument();

    expect(screen.queryByText("経理確認待ち")).not.toBeInTheDocument();
    expect(screen.queryByText("申請者編集中")).not.toBeInTheDocument();
    expect(screen.queryByText("更新あり")).not.toBeInTheDocument();
    expect(screen.queryByText(/担当者:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/未チェックコスト数/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "詳細" }),
    ).not.toBeInTheDocument();
  });

  it("下書きなら下書きバッジを出す", () => {
    renderWithMantine(
      <MatterCard
        {...userProps}
        matter={{ ...sampleMatter, is_fixed: false }}
      />,
    );

    expect(screen.getByText("下書き")).toBeInTheDocument();
    expect(screen.queryByText("申請者編集中")).not.toBeInTheDocument();
  });
});

describe("MatterCard variant=accounting", () => {
  const accountingProps = {
    variant: "accounting" as const,
    matter: sampleAccountingMatter,
    isChecked: false,
    onOpen: vi.fn(),
    onCheck: vi.fn(),
  };

  it("経理向けの詳細・担当者・更新ありを出し、一般向けの開くは出さない", () => {
    renderWithMantine(<MatterCard {...accountingProps} />);

    expect(screen.getByText("経理確認待ち")).toBeInTheDocument();
    expect(screen.getByText("更新あり")).toBeInTheDocument();
    expect(screen.getByText("担当者: 山田太郎")).toBeInTheDocument();
    expect(screen.getByText("未チェックコスト数: 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "詳細" })).toBeInTheDocument();

    expect(screen.queryByText("経理申請中")).not.toBeInTheDocument();
    expect(screen.queryByText("下書き")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "開く" }),
    ).not.toBeInTheDocument();
  });

  it("未申請なら申請者編集中バッジを出す", () => {
    renderWithMantine(
      <MatterCard
        {...accountingProps}
        matter={{
          ...sampleAccountingMatter,
          is_fixed: false,
          has_updates: false,
        }}
      />,
    );

    expect(screen.getByText("申請者編集中")).toBeInTheDocument();
    expect(screen.queryByText("下書き")).not.toBeInTheDocument();
    expect(screen.queryByText("更新あり")).not.toBeInTheDocument();
  });
});
