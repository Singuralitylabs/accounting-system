// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MatterCardDetail } from "@/app/components/modal/MatterCardDetail";
import { MatterInfoWithUserNameType, MatterType } from "@/app/types/types";
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
  description: "説明文",
  parent_matter_id: null,
  start_date: null,
  user_id: 1,
};

const sampleAccountingMatter: MatterInfoWithUserNameType = {
  ...sampleMatter,
  is_fixed: true,
  user_name: "山田太郎",
  slack_id: "U123",
};

const { useMatterDetail, idleMutation } = vi.hoisted(() => {
  const idleMutation = { mutateAsync: vi.fn(), isPending: false };
  return {
    idleMutation,
    useMatterDetail: vi.fn(() => ({
      data: { costs: [], businesses: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })),
  };
});

vi.mock("@/app/hooks/useMatterData", () => ({
  useMatterDetail,
  useUpdateMatter: () => idleMutation,
  useCreateMatter: () => idleMutation,
  useDeleteMatter: () => idleMutation,
  useRevertToFixed: () => idleMutation,
  useRevertToDraft: () => idleMutation,
  useCheckCompletedSingle: () => idleMutation,
  useSaveAccountingMemo: () => idleMutation,
}));

describe("MatterCardDetail", () => {
  beforeEach(() => {
    useMatterDetail.mockReturnValue({
      data: { costs: [], businesses: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });
  it("variant=user は更新・経理申請・追加ボタンを出し、経理メモは出さない", () => {
    renderWithMantine(
      <MatterCardDetail
        variant="user"
        matterInfo={sampleMatter}
        teamList={["開発"]}
        categoryList={["セミナー"]}
        itemList={["会場"]}
        certificateList={["請求書"]}
        opened
        setOpened={vi.fn()}
        isNew={false}
        setIsNew={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "更新" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "経理申請" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "取引先追加" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "コスト追加" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "削除" })).toBeInTheDocument();

    expect(screen.queryByLabelText("経理メモ")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "保存" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/閲覧専用/)).not.toBeInTheDocument();
    expect(screen.queryByText("収支サマリー")).not.toBeInTheDocument();
  });

  it("variant=accounting は経理メモと保存を出し、追加・更新は出さない", () => {
    renderWithMantine(
      <MatterCardDetail
        variant="accounting"
        matterInfo={sampleAccountingMatter}
        opened
        setOpened={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("経理メモ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "確認完了" }),
    ).toBeInTheDocument();
    expect(screen.getByText("担当者名")).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "更新" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "取引先追加" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "コスト追加" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/閲覧専用/)).not.toBeInTheDocument();
  });

  it("variant=readonly は閲覧専用で保存ボタンを出さない", () => {
    renderWithMantine(
      <MatterCardDetail
        variant="readonly"
        matterInfo={sampleAccountingMatter}
        opened
        setOpened={vi.fn()}
      />,
    );

    expect(screen.getByText(/閲覧専用/)).toBeInTheDocument();
    expect(screen.getByText("収支サマリー")).toBeInTheDocument();
    expect(screen.getByText("担当者")).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "保存" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "更新" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "経理申請" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "取引先追加" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("経理メモ")).not.toBeInTheDocument();
  });

  it("isLoading 中は LoadingOverlay を表示する", () => {
    useMatterDetail.mockReturnValue({
      data: { costs: [], businesses: [] },
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    const { baseElement } = renderWithMantine(
      <MatterCardDetail
        variant="readonly"
        matterInfo={sampleAccountingMatter}
        opened
        setOpened={vi.fn()}
      />,
    );

    expect(
      baseElement.querySelector(".mantine-LoadingOverlay-root"),
    ).not.toBeNull();
  });
});
