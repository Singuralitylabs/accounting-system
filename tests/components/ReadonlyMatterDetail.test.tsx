// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReadonlyMatterDetail } from "@/app/components/modal/matterDetail/ReadonlyMatterDetail";
import { MatterInfoWithUserNameType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const sampleMatter: MatterInfoWithUserNameType = {
  id: 42,
  title: "テスト案件",
  category: "セミナー",
  team: "開発",
  total_amount: 100000,
  total_cost: 20000,
  unchecked_cost_count: 0,
  has_updates: false,
  is_completed: false,
  is_fixed: true,
  inserted_at: "2026-01-15T00:00:00+09:00",
  updated_at: "2026-01-15T00:00:00+09:00",
  accounting_memo: null,
  business_count: 1,
  cost_count: 1,
  description: "説明文",
  parent_matter_id: null,
  start_date: null,
  user_id: 1,
  user_name: "山田太郎",
  slack_id: "U123",
};

const { useMatterDetail } = vi.hoisted(() => ({
  useMatterDetail: vi.fn(() => ({
    data: { costs: [], businesses: [] },
    isLoading: false,
  })),
}));

vi.mock("@/app/hooks/useMatterData", () => ({
  useMatterDetail,
}));

describe("ReadonlyMatterDetail", () => {
  it("開くたびに最新取得するよう staleTime 0 と refetchOnMount always を指定する", () => {
    renderWithMantine(
      <ReadonlyMatterDetail
        matterInfo={sampleMatter}
        opened
        setOpened={vi.fn()}
      />,
    );

    expect(screen.getByText("テスト案件")).toBeInTheDocument();
    expect(useMatterDetail).toHaveBeenCalledWith(42, true, {
      staleTime: 0,
      refetchOnMount: "always",
    });
  });
});
