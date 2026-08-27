// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountingMatterList } from "@/app/components/matterList/AccountingMatterList";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const { listState, mutateAsync, slackMutateAsync, notifyError, confirmAction } =
  vi.hoisted(() => ({
    listState: { is_fixed: true, checkPending: false, slackPending: false },
    mutateAsync: vi.fn(),
    slackMutateAsync: vi.fn(),
    notifyError: vi.fn(),
    confirmAction: vi.fn(async () => true),
  }));

vi.mock("@/app/hooks/useMatterData", () => {
  const base = {
    category: "セミナー",
    total_amount: 100000,
    total_cost: 20000,
    unchecked_cost_count: 0,
    has_updates: false,
    is_completed: false,
    inserted_at: "2026-01-15T00:00:00+09:00",
    updated_at: "2026-01-15T00:00:00+09:00",
    accounting_memo: null,
    business_count: 1,
    cost_count: 1,
    description: null,
    parent_matter_id: null,
    start_date: null,
    user_id: 1,
    profiles: { name: "山田太郎", slack_id: "U123" },
  };
  return {
    useAllMatterList: (
      _initial?: unknown,
      filters: { team?: string[] } = {},
    ) => {
      const all = [
        {
          ...base,
          id: 42,
          title: "テスト案件",
          team: "開発",
          is_fixed: listState.is_fixed,
        },
        {
          ...base,
          id: 43,
          title: "別チーム案件",
          team: "営業",
          is_fixed: true,
        },
      ];
      const data = filters.team?.length
        ? all.filter((matter) => filters.team?.includes(matter.team))
        : all;
      return { data };
    },
    useCheckCompleted: () => ({
      mutateAsync,
      isPending: listState.checkPending,
    }),
    useSlackNotification: () => ({
      mutateAsync: slackMutateAsync,
      isPending: listState.slackPending,
    }),
  };
});

vi.mock("@/app/utils/notify", () => ({
  notifyError,
  notifyInfo: vi.fn(),
  notifySuccess: vi.fn(),
}));

vi.mock("@/app/utils/confirmAction", () => ({
  confirmAction,
}));

vi.mock("@mantine/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mantine/hooks")>();
  return {
    ...actual,
    useViewportSize: () => ({ width: 1024, height: 800 }),
  };
});

describe("AccountingMatterList", () => {
  beforeEach(() => {
    listState.is_fixed = true;
    listState.checkPending = false;
    listState.slackPending = false;
    mutateAsync.mockReset();
    slackMutateAsync.mockReset();
    notifyError.mockReset();
    confirmAction.mockReset();
    confirmAction.mockResolvedValue(true);
  });

  it("未選択で確認完了を押すと案内を出す", () => {
    renderWithMantine(<AccountingMatterList />);

    fireEvent.click(screen.getByRole("button", { name: "確認完了" }));

    expect(notifyError).toHaveBeenCalledWith(
      "完了にする案件にチェックを入れてください。",
    );
    expect(confirmAction).not.toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("表示中リストの is_fixed=false なら完了対象から除外する", async () => {
    listState.is_fixed = false;
    renderWithMantine(<AccountingMatterList />);

    fireEvent.click(screen.getAllByLabelText("案件チェック")[0]);
    fireEvent.click(screen.getByRole("button", { name: "確認完了" }));

    await vi.waitFor(() => {
      expect(notifyError).toHaveBeenCalledWith(
        "下書きのため完了できません: テスト案件",
      );
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("フィルタ適用後の最新 is_fixed をスナップショットより優先する", async () => {
    renderWithMantine(<AccountingMatterList />);

    fireEvent.click(screen.getByRole("button", { name: "チームの絞り込み" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "開発" }));

    listState.is_fixed = false;
    fireEvent.click(screen.getByLabelText("案件チェック"));
    fireEvent.click(screen.getByRole("button", { name: "確認完了" }));

    await vi.waitFor(() => {
      expect(notifyError).toHaveBeenCalledWith(
        "下書きのため完了できません: テスト案件",
      );
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("カード表示でもアクティブなフィルタを解除できる", async () => {
    renderWithMantine(<AccountingMatterList />);

    fireEvent.click(screen.getByRole("button", { name: "チームの絞り込み" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "開発" }));
    fireEvent.click(screen.getByRole("button", { name: "カード表示" }));

    expect(screen.getByText("絞り込み中:")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "チームの絞り込みを解除" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "すべて解除" }));
    expect(screen.queryByText("絞り込み中:")).not.toBeInTheDocument();
  });

  it("一部が非表示のとき対象外を確認し、完了した ID だけチェックを外す", async () => {
    mutateAsync.mockResolvedValue(true);
    renderWithMantine(<AccountingMatterList />);

    const checkboxes = screen.getAllByLabelText("案件チェック");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole("button", { name: "チームの絞り込み" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "開発" }));
    fireEvent.click(screen.getByRole("button", { name: "確認完了" }));

    await vi.waitFor(() => {
      expect(confirmAction).toHaveBeenCalledWith(
        expect.stringContaining("非表示のため対象外"),
      );
      expect(mutateAsync).toHaveBeenCalledWith([42]);
    });
    await vi.waitFor(() => {
      expect(screen.getByLabelText("案件チェック")).not.toBeChecked();
    });

    fireEvent.click(screen.getByRole("button", { name: "すべて解除" }));
    const remaining = screen.getAllByLabelText("案件チェック");
    expect(remaining[0]).not.toBeChecked();
    expect(remaining[1]).toBeChecked();
  });

  it("確認完了の処理中はボタンに loading を出す", () => {
    listState.checkPending = true;
    renderWithMantine(<AccountingMatterList />);

    const button = screen.getByRole("button", { name: "確認完了" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("data-loading", "true");
  });
});
