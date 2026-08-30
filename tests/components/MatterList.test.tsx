// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MatterList } from "@/app/components/MatterList";
import { MatterType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const sampleMatter: MatterType = {
  id: 42,
  title: "テスト案件",
  category: "セミナー",
  team: "開発",
  total_amount: 100000,
  total_cost: 20000,
  unchecked_cost_count: 0,
  has_updates: false,
  is_completed: false,
  is_fixed: false,
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

vi.mock("@/app/hooks/useMatterData", () => ({
  useUserMatterList: () => ({ data: [sampleMatter] }),
  useAllMatterList: () => ({ data: [] }),
  useDeleteMatter: () => ({ mutateAsync: vi.fn() }),
  useSlackNotification: () => ({ mutateAsync: vi.fn() }),
  useCheckCompleted: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@mantine/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mantine/hooks")>();
  return {
    ...actual,
    useViewportSize: () => ({ width: 1024, height: 800 }),
  };
});

describe("MatterList", () => {
  it("variant=user は開くボタンを出し、経理の確認完了は出さない", () => {
    renderWithMantine(<MatterList variant="user" />);

    expect(screen.getByRole("button", { name: "開く" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "確認完了" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "担当者に連絡" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/閲覧のみ可能/)).not.toBeInTheDocument();
  });

  it("variant=accounting は確認完了と担当者連絡を出し、開くは出さない", () => {
    renderWithMantine(<MatterList variant="accounting" />);

    expect(
      screen.getByRole("button", { name: "確認完了" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "担当者に連絡" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "開く" }),
    ).not.toBeInTheDocument();
  });

  it("variant=readonly で空ならチーム案件の空表示を出す", () => {
    renderWithMantine(<MatterList variant="readonly" matterList={[]} />);

    expect(
      screen.getByText("表示できるチーム案件がありません。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "確認完了" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "開く" }),
    ).not.toBeInTheDocument();
  });

  it("variant=readonly は閲覧のみの案内と詳細ボタンを出す", () => {
    renderWithMantine(
      <MatterList
        variant="readonly"
        matterList={[
          {
            id: 42,
            title: "チーム案件",
            category: "セミナー",
            team: "開発",
            description: null,
            start_date: null,
            total_amount: 100000,
            total_cost: 20000,
            is_fixed: true,
            is_completed: false,
            inserted_at: "2026-01-15T00:00:00+09:00",
            profiles: { name: "山田太郎", slack_id: "U123" },
          },
        ]}
      />,
    );

    expect(screen.getByText("チーム案件")).toBeInTheDocument();
    expect(screen.getByText("山田太郎")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "詳細" })).toBeInTheDocument();
    expect(screen.getByText("経理申請中")).toBeInTheDocument();
    expect(screen.getByText(/件の案件が表示されています/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "開く" }),
    ).not.toBeInTheDocument();
  });
});
