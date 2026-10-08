// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountingMatterList } from "@/app/components/matterList/AccountingMatterList";
import { notifyError } from "@/app/utils/notify";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const { listState, mutateAsync, slackMutateAsync, confirmAction } = vi.hoisted(
  () => ({
    listState: {
      is_fixed: true,
      checkPending: false,
      slackPending: false,
      isPlaceholderData: false,
      isFetching: false,
      isError: false,
      empty: false,
    },
    mutateAsync: vi.fn(),
    slackMutateAsync: vi.fn(),
    confirmAction: vi.fn(async () => true),
  }),
);

// The closed-month notice in the detail modal uses TanStack Query; stub it as "no closed months"
// (there is no QueryClientProvider here).
vi.mock("@/app/utils/supabase/slackNotificationSettings", () => ({
  getSlackNotificationSettings: vi.fn(),
  updateSlackNotificationSettings: vi.fn(),
}));

vi.mock("@/app/hooks/useClosedMonths", () => ({
  useClosedMonths: () => ({ closedMonths: new Set<string>() }),
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
      return {
        data: listState.empty ? undefined : data,
        isPlaceholderData: listState.isPlaceholderData,
        isFetching: listState.isFetching,
        isError: listState.isError,
      };
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

vi.mock("@/app/utils/notify", () =>
  import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
);

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
    listState.isPlaceholderData = false;
    listState.isFetching = false;
    listState.isError = false;
    listState.empty = false;
    mutateAsync.mockReset();
    slackMutateAsync.mockReset();
    vi.mocked(notifyError).mockReset();
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

  it("フィルタ変更の取得中は前の一覧を残したまま読み込み中を表示する", () => {
    listState.isPlaceholderData = true;
    listState.isFetching = true;
    renderWithMantine(<AccountingMatterList />);

    expect(screen.getByText("テスト案件")).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "読み込み中" }),
    ).toBeInTheDocument();
  });

  it("取得失敗で一覧が無いときはエラーを表示し、0件の表にしない", () => {
    listState.isError = true;
    listState.empty = true;
    renderWithMantine(<AccountingMatterList />);

    expect(
      screen.getByText("案件一覧の取得に失敗しました"),
    ).toBeInTheDocument();
    expect(screen.queryByText("テスト案件")).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "読み込み中" })).toBeNull();
  });

  describe("担当者に連絡", () => {
    it("操作ボタンは「担当者に連絡」だけで、「通知設定」ボタンは無い", () => {
      renderWithMantine(<AccountingMatterList />);

      expect(
        screen.getAllByRole("button", { name: "担当者に連絡" }),
      ).toHaveLength(1);
      expect(
        screen.queryByRole("button", { name: "通知設定" }),
      ).not.toBeInTheDocument();
    });

    it("投稿先チャンネル名をボタンの近くに表示し、未設定なら表示しない", () => {
      const { unmount } = renderWithMantine(
        <AccountingMatterList slackChannelName="#経理連絡" />,
      );
      expect(screen.getByTestId("slack-channel-name-label")).toHaveTextContent(
        "#経理連絡",
      );
      unmount();

      renderWithMantine(<AccountingMatterList />);
      expect(
        screen.queryByTestId("slack-channel-name-label"),
      ).not.toBeInTheDocument();
    });

    it("押すと 1 つのモーダルが開き、タイトルに投稿先チャンネル名が出る。「送信」「文面の設定」を切り替えられる", async () => {
      renderWithMantine(<AccountingMatterList slackChannelName="#経理連絡" />);

      fireEvent.click(screen.getByRole("button", { name: "担当者に連絡" }));

      expect(await screen.findAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByTestId("slack-channel-name")).toHaveTextContent(
        "#経理連絡",
      );
      expect(screen.getByRole("tab", { name: "送信" })).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "文面の設定" }),
      ).toBeInTheDocument();
    });

    it("チェックした案件に、入力したメッセージを送信する", async () => {
      slackMutateAsync.mockResolvedValue({
        failedTitles: [],
        dbUpdateFailed: false,
      });
      renderWithMantine(<AccountingMatterList />);

      fireEvent.click(screen.getAllByLabelText("案件チェック")[0]);
      fireEvent.click(screen.getByRole("button", { name: "担当者に連絡" }));
      fireEvent.change(
        await screen.findByPlaceholderText(
          "案件担当者に通知したい内容をご記載ください。",
        ),
        { target: { value: "確認してください" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "slack通知" }));

      await vi.waitFor(() =>
        expect(slackMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ message: "確認してください" }),
        ),
      );
    });

    it("案件を選択していない場合、送信はエラー通知になるが文面の設定タブは開ける", async () => {
      renderWithMantine(<AccountingMatterList />);

      fireEvent.click(screen.getByRole("button", { name: "担当者に連絡" }));
      fireEvent.click(await screen.findByRole("tab", { name: "文面の設定" }));

      expect(screen.getByRole("tab", { name: "文面の設定" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });
});
