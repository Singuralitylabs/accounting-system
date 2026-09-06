// @vitest-environment jsdom

import { fireEvent, screen, within } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { optionsAtom } from "@/app/atoms/optionsAtom";
import BudgetDeclarationForm from "@/app/components/budgetDeclarations/BudgetDeclarationForm";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const {
  useBudgetDeclarationDetail,
  usePreviousBudgetDeclarationItems,
  useActiveBudgetRecurringItems,
  saveMutation,
  deleteMutation,
  confirmAction,
  notifyError,
} = vi.hoisted(() => ({
  useBudgetDeclarationDetail: vi.fn(),
  usePreviousBudgetDeclarationItems: vi.fn(),
  useActiveBudgetRecurringItems: vi.fn(),
  saveMutation: {
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  },
  deleteMutation: {
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  },
  confirmAction: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock("@/app/hooks/useBudgetDeclarationData", () => ({
  useBudgetDeclarationDetail,
  usePreviousBudgetDeclarationItems,
  useSaveBudgetDeclaration: () => saveMutation,
  useDeleteBudgetDeclaration: () => deleteMutation,
}));

vi.mock("@/app/hooks/useBudgetRecurringItemData", () => ({
  useActiveBudgetRecurringItems,
}));

vi.mock("@/app/utils/confirmAction", () => ({ confirmAction }));
vi.mock("@/app/utils/notify", () => ({
  notifyError,
  notifySuccess: vi.fn(),
  toErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

// 「チーム」Select のドロップダウンは、この Modal 配下では開いた後も
// ラッパーに aria-hidden が残る（Mantine + jsdom の組み合わせによる既知の
// 表示上のクセで、他の Select（担当者・分類など）では発生しない）ため
// screen.findByRole("option", …) では見つからない。実 DOM 上には
// role="option" の要素自体は存在し、click も正しく処理されるため、
// querySelector で直接取得してクリックする
const selectTeamOption = async (teamInput: HTMLElement, label: string) => {
  fireEvent.click(teamInput);
  const option = await vi.waitFor(() => {
    const el = document.querySelector(`[role="option"][value="${label}"]`);
    if (!el) throw new Error(`option "${label}" not found`);
    return el as HTMLElement;
  });
  fireEvent.click(option);
};

const emptyDetail = () => ({
  data: undefined,
  isLoading: false,
  isError: false,
});

const testMemberList = [
  { value: "1", label: "山田太郎" },
  { value: "2", label: "鈴木花子" },
];

describe("BudgetDeclarationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBudgetDeclarationDetail.mockReturnValue(emptyDetail());
    usePreviousBudgetDeclarationItems.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    });
    useActiveBudgetRecurringItems.mockReturnValue({
      data: [],
      isFetching: false,
    });
    saveMutation.isPending = false;
    deleteMutation.isPending = false;
  });

  it("新規作成（チームリーダー）はチーム選択を固定表示する", () => {
    renderWithMantine(
      <BudgetDeclarationForm
        opened
        onClose={vi.fn()}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={null}
        teamLocked
        memberList={testMemberList}
      />,
    );

    expect(screen.getByRole("textbox", { name: "チーム" })).toHaveValue(
      "開発チーム",
    );
    expect(screen.getByRole("textbox", { name: "チーム" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "削除" }),
    ).not.toBeInTheDocument();
  });

  it("新規作成（経理・管理者）はチーム選択が可能", () => {
    renderWithMantine(
      <BudgetDeclarationForm
        opened
        onClose={vi.fn()}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={null}
        teamLocked={false}
        memberList={testMemberList}
      />,
    );

    expect(screen.getByRole("textbox", { name: "チーム" })).not.toBeDisabled();
  });

  it("編集時は経理・管理者でもチーム選択を固定する", () => {
    useBudgetDeclarationDetail.mockReturnValue({
      data: { comment: "", items: [] },
      isLoading: false,
      isError: false,
    });

    renderWithMantine(
      <BudgetDeclarationForm
        opened
        onClose={vi.fn()}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={7}
        teamLocked={false}
        memberList={testMemberList}
      />,
    );

    expect(screen.getByRole("textbox", { name: "チーム" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "削除" })).toBeInTheDocument();
  });

  it("編集時に既存明細の取得が失敗している間は保存できない（明細消失防止）", () => {
    useBudgetDeclarationDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderWithMantine(
      <BudgetDeclarationForm
        opened
        onClose={vi.fn()}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={7}
        teamLocked={false}
        memberList={testMemberList}
      />,
    );

    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(saveMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("キャッシュ済みの古い detail が裏で再取得中（isFetching）の間は、古い内容を反映せず保存も無効化する", () => {
    const staleDetail = {
      comment: "古いコメント",
      items: [
        {
          id: 1,
          declaration_id: 7,
          entry_type: "income",
          category: "セミナー",
          description: "古い内容",
          amount: 100000,
          display_order: 0,
          inserted_at: "",
          updated_at: "",
        },
      ],
    };
    // useQuery は staleTime 内のキャッシュを即座に返しつつ、
    // refetchOnMount: "always" によりバックグラウンドで再取得中の状態を模す
    useBudgetDeclarationDetail.mockReturnValue({
      data: staleDetail,
      isLoading: false,
      isError: false,
      isFetching: true,
    });

    const { rerender } = renderWithMantine(
      <BudgetDeclarationForm
        opened
        onClose={vi.fn()}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={7}
        teamLocked={false}
        memberList={testMemberList}
      />,
    );

    // 取得中は古いキャッシュの内容を反映しない（明細 0 件のまま）
    expect(screen.getByText("明細が登録されていません。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();

    // 再取得が完了し、最新データが届く
    useBudgetDeclarationDetail.mockReturnValue({
      data: staleDetail,
      isLoading: false,
      isError: false,
      isFetching: false,
    });
    rerender(
      <BudgetDeclarationForm
        opened
        onClose={vi.fn()}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={7}
        teamLocked={false}
        memberList={testMemberList}
      />,
    );

    expect(screen.getByDisplayValue("古い内容")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).not.toBeDisabled();
  });

  it("明細を追加・削除できる", () => {
    renderWithMantine(
      <BudgetDeclarationForm
        opened
        onClose={vi.fn()}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={null}
        teamLocked
        memberList={testMemberList}
      />,
    );

    expect(screen.getByText("明細が登録されていません。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "明細追加" }));
    expect(
      screen.queryByText("明細が登録されていません。"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "明細を削除" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "明細を削除" }));
    expect(screen.getByText("明細が登録されていません。")).toBeInTheDocument();
  });

  it("明細が未入力のまま保存すると案内を出し、保存処理を呼ばない", () => {
    renderWithMantine(
      <BudgetDeclarationForm
        opened
        onClose={vi.fn()}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={null}
        teamLocked
        memberList={testMemberList}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "明細追加" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(notifyError).toHaveBeenCalledWith(
      "明細の種別・分類・内容が未入力の行があります。",
    );
    expect(saveMutation.mutateAsync).not.toHaveBeenCalled();
    expect(confirmAction).not.toHaveBeenCalled();
  });

  it("確認後に既存の明細をそのまま保存できる", async () => {
    useBudgetDeclarationDetail.mockReturnValue({
      data: {
        comment: "既存コメント",
        items: [
          {
            id: 1,
            declaration_id: 7,
            entry_type: "income",
            category: "セミナー",
            description: "○○受託案件",
            amount: 500000,
            manager_id: null,
            display_order: 0,
            inserted_at: "",
            updated_at: "",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    confirmAction.mockResolvedValue(true);
    const onClose = vi.fn();

    renderWithMantine(
      <BudgetDeclarationForm
        opened
        onClose={onClose}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={7}
        teamLocked={false}
        memberList={testMemberList}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await vi.waitFor(() => expect(saveMutation.mutateAsync).toHaveBeenCalled());

    expect(saveMutation.mutateAsync).toHaveBeenCalledWith({
      declarationId: 7,
      targetMonth: "2026-10",
      team: "開発チーム",
      comment: "既存コメント",
      items: [
        {
          entry_type: "income",
          category: "セミナー",
          description: "○○受託案件",
          amount: 500000,
          manager_id: null,
        },
      ],
    });
    expect(notifyError).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("編集中に detail が新しい参照で再取得されても、入力中の内容を上書きしない", () => {
    const initialDetail = {
      comment: "元のコメント",
      items: [
        {
          id: 1,
          declaration_id: 7,
          entry_type: "income",
          category: "セミナー",
          description: "元の内容",
          amount: 500000,
          display_order: 0,
          inserted_at: "",
          updated_at: "",
        },
      ],
    };
    useBudgetDeclarationDetail.mockReturnValue({
      data: initialDetail,
      isLoading: false,
      isError: false,
    });

    const { rerender } = renderWithMantine(
      <BudgetDeclarationForm
        opened
        onClose={vi.fn()}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={7}
        teamLocked={false}
        memberList={testMemberList}
      />,
    );

    const descriptionInput = screen.getByPlaceholderText("例: ○○受託案件");
    fireEvent.change(descriptionInput, { target: { value: "編集中の内容" } });
    expect(descriptionInput).toHaveValue("編集中の内容");

    // 保存成功時の invalidate や再フォーカス等で detail が新しい参照になった状況を模す
    // （declarationId は同じ 7 のまま）
    useBudgetDeclarationDetail.mockReturnValue({
      data: { ...initialDetail, items: [...initialDetail.items] },
      isLoading: false,
      isError: false,
    });
    rerender(
      <BudgetDeclarationForm
        opened
        onClose={vi.fn()}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={7}
        teamLocked={false}
        memberList={testMemberList}
      />,
    );

    expect(descriptionInput).toHaveValue("編集中の内容");
  });

  it("削除ボタンは確認後に削除処理を呼ぶ", async () => {
    useBudgetDeclarationDetail.mockReturnValue({
      data: { comment: "", items: [] },
      isLoading: false,
      isError: false,
    });
    confirmAction.mockResolvedValue(true);
    const onClose = vi.fn();

    renderWithMantine(
      <BudgetDeclarationForm
        opened
        onClose={onClose}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={7}
        teamLocked={false}
        memberList={testMemberList}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    await vi.waitFor(() =>
      expect(deleteMutation.mutateAsync).toHaveBeenCalledWith({
        declarationId: 7,
        team: "開発チーム",
      }),
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("削除処理の実行中は削除ボタンを無効化する（二重送信防止）", () => {
    useBudgetDeclarationDetail.mockReturnValue({
      data: { comment: "", items: [] },
      isLoading: false,
      isError: false,
    });
    deleteMutation.isPending = true;

    renderWithMantine(
      <BudgetDeclarationForm
        opened
        onClose={vi.fn()}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={7}
        teamLocked={false}
        memberList={testMemberList}
      />,
    );

    expect(screen.getByRole("button", { name: "削除" })).toBeDisabled();
  });

  it("削除確認をキャンセルすると削除処理を呼ばない", async () => {
    useBudgetDeclarationDetail.mockReturnValue({
      data: { comment: "", items: [] },
      isLoading: false,
      isError: false,
    });
    confirmAction.mockResolvedValue(false);

    renderWithMantine(
      <BudgetDeclarationForm
        opened
        onClose={vi.fn()}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={7}
        teamLocked={false}
        memberList={testMemberList}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    await vi.waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(deleteMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("明細行の担当者を選択・変更・クリアでき、保存時に manager_id として送信される", async () => {
    useBudgetDeclarationDetail.mockReturnValue({
      data: {
        comment: "",
        items: [
          {
            id: 1,
            declaration_id: 7,
            entry_type: "income",
            category: "セミナー",
            description: "○○受託案件",
            amount: 500000,
            manager_id: null,
            display_order: 0,
            inserted_at: "",
            updated_at: "",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    confirmAction.mockResolvedValue(true);

    renderWithMantine(
      <BudgetDeclarationForm
        opened
        onClose={vi.fn()}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={7}
        teamLocked={false}
        memberList={testMemberList}
      />,
    );

    // 担当者を選択する
    const managerInput = screen.getByPlaceholderText("担当者を選択");
    fireEvent.click(managerInput);
    fireEvent.click(await screen.findByRole("option", { name: "山田太郎" }));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await vi.waitFor(() => expect(saveMutation.mutateAsync).toHaveBeenCalled());
    expect(saveMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ manager_id: 1 })],
      }),
    );

    // 担当者を変更する
    saveMutation.mutateAsync.mockClear();
    fireEvent.click(managerInput);
    fireEvent.click(await screen.findByRole("option", { name: "鈴木花子" }));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await vi.waitFor(() => expect(saveMutation.mutateAsync).toHaveBeenCalled());
    expect(saveMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ manager_id: 2 })],
      }),
    );

    // 担当者をクリアする（未選択で保存できる）
    saveMutation.mutateAsync.mockClear();
    const managerCell = managerInput.closest("td") as HTMLElement;
    fireEvent.click(within(managerCell).getByRole("button", { hidden: true }));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await vi.waitFor(() => expect(saveMutation.mutateAsync).toHaveBeenCalled());
    expect(saveMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ manager_id: null })],
      }),
    );
  });

  it("担当者未設定の既存明細も従来どおり表示・編集できる", () => {
    useBudgetDeclarationDetail.mockReturnValue({
      data: {
        comment: "",
        items: [
          {
            id: 1,
            declaration_id: 7,
            entry_type: "income",
            category: "セミナー",
            description: "既存の明細",
            amount: 300000,
            manager_id: null,
            display_order: 0,
            inserted_at: "",
            updated_at: "",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    renderWithMantine(
      <BudgetDeclarationForm
        opened
        onClose={vi.fn()}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={7}
        teamLocked={false}
        memberList={testMemberList}
      />,
    );

    expect(screen.getByDisplayValue("既存の明細")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("担当者を選択")).toHaveValue("");
  });

  it("担当者選択肢の取得に失敗している間は担当者 Select を disabled にし、既存の manager_id を見せかけ上クリアしない", () => {
    useBudgetDeclarationDetail.mockReturnValue({
      data: {
        comment: "",
        items: [
          {
            id: 1,
            declaration_id: 7,
            entry_type: "income",
            category: "セミナー",
            description: "既存の明細",
            amount: 300000,
            manager_id: 1,
            display_order: 0,
            inserted_at: "",
            updated_at: "",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    renderWithMantine(
      <BudgetDeclarationForm
        opened
        onClose={vi.fn()}
        targetMonth="2026-10"
        team="開発チーム"
        declarationId={7}
        teamLocked={false}
        memberList={[]}
        memberListError
      />,
    );

    const managerInput =
      screen.getByPlaceholderText("担当者一覧を取得できませんでした");
    expect(managerInput).toBeDisabled();
  });

  describe("前月の明細をコピー", () => {
    it("前月の申告が無い場合はボタンを無効化する", () => {
      usePreviousBudgetDeclarationItems.mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
      });

      renderWithMantine(
        <BudgetDeclarationForm
          opened
          onClose={vi.fn()}
          targetMonth="2026-10"
          team="開発チーム"
          declarationId={null}
          teamLocked
          memberList={testMemberList}
        />,
      );

      expect(
        screen.getByRole("button", { name: "前月の明細をコピー" }),
      ).toBeDisabled();
    });

    it("前月の申告はあるが明細が0件の場合もボタンを無効化する（何も追加できないため）", () => {
      usePreviousBudgetDeclarationItems.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      });

      renderWithMantine(
        <BudgetDeclarationForm
          opened
          onClose={vi.fn()}
          targetMonth="2026-10"
          team="開発チーム"
          declarationId={null}
          teamLocked
          memberList={testMemberList}
        />,
      );

      expect(
        screen.getByRole("button", { name: "前月の明細をコピー" }),
      ).toBeDisabled();
    });

    it("編集時はボタンを表示しない", () => {
      useBudgetDeclarationDetail.mockReturnValue({
        data: { comment: "", items: [] },
        isLoading: false,
        isError: false,
      });
      usePreviousBudgetDeclarationItems.mockReturnValue({
        data: [
          {
            id: 1,
            entry_type: "income",
            category: "セミナー",
            description: "○○受託案件",
            amount: 500000,
            manager_id: 1,
            display_order: 0,
          },
        ],
        isLoading: false,
        isError: false,
      });

      renderWithMantine(
        <BudgetDeclarationForm
          opened
          onClose={vi.fn()}
          targetMonth="2026-10"
          team="開発チーム"
          declarationId={7}
          teamLocked={false}
          memberList={testMemberList}
        />,
      );

      expect(
        screen.queryByRole("button", { name: "前月の明細をコピー" }),
      ).not.toBeInTheDocument();
    });

    it("明細が未入力の状態では確認なしで前月の明細（担当者含む）を取り込む", () => {
      usePreviousBudgetDeclarationItems.mockReturnValue({
        data: [
          {
            id: 1,
            entry_type: "income",
            category: "セミナー",
            description: "○○受託案件",
            amount: 500000,
            manager_id: 1,
            display_order: 0,
          },
        ],
        isLoading: false,
        isError: false,
      });

      renderWithMantine(
        <BudgetDeclarationForm
          opened
          onClose={vi.fn()}
          targetMonth="2026-10"
          team="開発チーム"
          declarationId={null}
          teamLocked
          memberList={testMemberList}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "前月の明細をコピー" }),
      );

      expect(confirmAction).not.toHaveBeenCalled();
      expect(screen.getByDisplayValue("○○受託案件")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("担当者を選択")).toHaveValue(
        "山田太郎",
      );
    });

    it("既に明細行がある状態で押すと追記の確認ダイアログを出し、承諾すると末尾に追加する", async () => {
      usePreviousBudgetDeclarationItems.mockReturnValue({
        data: [
          {
            id: 1,
            entry_type: "expense",
            category: "外注費",
            description: "外注A",
            amount: 100000,
            manager_id: null,
            display_order: 0,
          },
        ],
        isLoading: false,
        isError: false,
      });
      confirmAction.mockResolvedValue(true);

      renderWithMantine(
        <BudgetDeclarationForm
          opened
          onClose={vi.fn()}
          targetMonth="2026-10"
          team="開発チーム"
          declarationId={null}
          teamLocked
          memberList={testMemberList}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "明細追加" }));
      fireEvent.click(
        screen.getByRole("button", { name: "前月の明細をコピー" }),
      );

      expect(confirmAction).toHaveBeenCalled();
      await screen.findByDisplayValue("外注A");
      // 既存の空行 + コピーした 1 行で明細は 2 行になる
      expect(
        screen.getAllByRole("button", { name: "明細を削除" }),
      ).toHaveLength(2);
    });

    it("追記の確認をキャンセルすると取り込まない", async () => {
      usePreviousBudgetDeclarationItems.mockReturnValue({
        data: [
          {
            id: 1,
            entry_type: "expense",
            category: "外注費",
            description: "外注A",
            amount: 100000,
            manager_id: null,
            display_order: 0,
          },
        ],
        isLoading: false,
        isError: false,
      });
      confirmAction.mockResolvedValue(false);

      renderWithMantine(
        <BudgetDeclarationForm
          opened
          onClose={vi.fn()}
          targetMonth="2026-10"
          team="開発チーム"
          declarationId={null}
          teamLocked
          memberList={testMemberList}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "明細追加" }));
      fireEvent.click(
        screen.getByRole("button", { name: "前月の明細をコピー" }),
      );

      await vi.waitFor(() => expect(confirmAction).toHaveBeenCalled());
      expect(screen.queryByDisplayValue("外注A")).not.toBeInTheDocument();
    });

    it("コピー後にチームを変更すると確認のうえ明細をクリアする（別チームの明細を紛れ込ませない）", async () => {
      usePreviousBudgetDeclarationItems.mockReturnValue({
        data: [
          {
            id: 1,
            entry_type: "expense",
            category: "外注費",
            description: "外注A",
            amount: 100000,
            manager_id: null,
            display_order: 0,
          },
        ],
        isLoading: false,
        isError: false,
      });
      confirmAction.mockResolvedValue(true);

      const store = createStore();
      store.set(optionsAtom, {
        teamList: ["開発チーム", "経理チーム"],
        categoryList: [],
        itemList: [],
        certificateList: [],
      });

      renderWithMantine(
        <Provider store={store}>
          <BudgetDeclarationForm
            opened
            onClose={vi.fn()}
            targetMonth="2026-10"
            team="開発チーム"
            declarationId={null}
            teamLocked={false}
            memberList={testMemberList}
          />
        </Provider>,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "前月の明細をコピー" }),
      );
      await screen.findByDisplayValue("外注A");

      confirmAction.mockClear();
      await selectTeamOption(
        screen.getByRole("textbox", { name: "チーム" }),
        "経理チーム",
      );

      await vi.waitFor(() => expect(confirmAction).toHaveBeenCalled());
      expect(screen.queryByDisplayValue("外注A")).not.toBeInTheDocument();
      // confirmAction の resolve から setItems/form.setFieldValue までは
      // イベントハンドラの外（Promise 継続）での state 更新のため、
      // 反映まで 1 tick 分のズレが生じうる。値の確定を待ってから検証する
      await vi.waitFor(() =>
        expect(screen.getByRole("textbox", { name: "チーム" })).toHaveValue(
          "経理チーム",
        ),
      );
    });

    it("明細がある状態でチームの変更をキャンセルするとチーム・明細とも変わらない", async () => {
      usePreviousBudgetDeclarationItems.mockReturnValue({
        data: [
          {
            id: 1,
            entry_type: "expense",
            category: "外注費",
            description: "外注A",
            amount: 100000,
            manager_id: null,
            display_order: 0,
          },
        ],
        isLoading: false,
        isError: false,
      });
      confirmAction.mockResolvedValue(true);

      const store = createStore();
      store.set(optionsAtom, {
        teamList: ["開発チーム", "経理チーム"],
        categoryList: [],
        itemList: [],
        certificateList: [],
      });

      renderWithMantine(
        <Provider store={store}>
          <BudgetDeclarationForm
            opened
            onClose={vi.fn()}
            targetMonth="2026-10"
            team="開発チーム"
            declarationId={null}
            teamLocked={false}
            memberList={testMemberList}
          />
        </Provider>,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "前月の明細をコピー" }),
      );
      await screen.findByDisplayValue("外注A");

      confirmAction.mockClear();
      confirmAction.mockResolvedValue(false);
      const teamInput = screen.getByRole("textbox", { name: "チーム" });
      await selectTeamOption(teamInput, "経理チーム");

      await vi.waitFor(() => expect(confirmAction).toHaveBeenCalled());
      expect(screen.getByDisplayValue("外注A")).toBeInTheDocument();
      expect(teamInput).toHaveValue("開発チーム");
    });
  });

  describe("定期明細の自動投入", () => {
    it("新規作成時、対象月が適用期間内の定期明細（担当者含む）が明細行として自動で入る（バッジ表示）", () => {
      useActiveBudgetRecurringItems.mockReturnValue({
        data: [
          {
            id: 1,
            entry_type: "expense",
            category: "外注費",
            description: "○○保守契約",
            amount: 100000,
            manager_id: 1,
            display_order: 0,
          },
        ],
        isFetching: false,
      });

      renderWithMantine(
        <BudgetDeclarationForm
          opened
          onClose={vi.fn()}
          targetMonth="2026-10"
          team="開発チーム"
          declarationId={null}
          teamLocked
          memberList={testMemberList}
        />,
      );

      expect(screen.getByDisplayValue("○○保守契約")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("担当者を選択")).toHaveValue(
        "山田太郎",
      );
      expect(screen.getByText("定期")).toBeInTheDocument();
    });

    it("取得完了前（isFetching）は投入せず、完了後に投入する", () => {
      useActiveBudgetRecurringItems.mockReturnValue({
        data: undefined,
        isFetching: true,
      });

      const { rerender } = renderWithMantine(
        <BudgetDeclarationForm
          opened
          onClose={vi.fn()}
          targetMonth="2026-10"
          team="開発チーム"
          declarationId={null}
          teamLocked
          memberList={testMemberList}
        />,
      );

      expect(
        screen.getByText("明細が登録されていません。"),
      ).toBeInTheDocument();

      useActiveBudgetRecurringItems.mockReturnValue({
        data: [
          {
            id: 1,
            entry_type: "income",
            category: "セミナー",
            description: "○○受託案件",
            amount: 500000,
            manager_id: null,
            display_order: 0,
          },
        ],
        isFetching: false,
      });
      rerender(
        <BudgetDeclarationForm
          opened
          onClose={vi.fn()}
          targetMonth="2026-10"
          team="開発チーム"
          declarationId={null}
          teamLocked
          memberList={testMemberList}
        />,
      );

      expect(screen.getByDisplayValue("○○受託案件")).toBeInTheDocument();
    });

    it("既存申告の編集時には自動投入しない（二重計上防止）", () => {
      useBudgetDeclarationDetail.mockReturnValue({
        data: { comment: "", items: [] },
        isLoading: false,
        isError: false,
      });
      useActiveBudgetRecurringItems.mockReturnValue({
        data: [
          {
            id: 1,
            entry_type: "income",
            category: "セミナー",
            description: "○○受託案件",
            amount: 500000,
            manager_id: null,
            display_order: 0,
          },
        ],
        isFetching: false,
      });

      renderWithMantine(
        <BudgetDeclarationForm
          opened
          onClose={vi.fn()}
          targetMonth="2026-10"
          team="開発チーム"
          declarationId={7}
          teamLocked={false}
          memberList={testMemberList}
        />,
      );

      expect(
        screen.getByText("明細が登録されていません。"),
      ).toBeInTheDocument();
      expect(screen.queryByDisplayValue("○○受託案件")).not.toBeInTheDocument();
    });

    it("保存ペイロードには定期明細由来かどうかのフラグを含めない", async () => {
      useActiveBudgetRecurringItems.mockReturnValue({
        data: [
          {
            id: 1,
            entry_type: "expense",
            category: "外注費",
            description: "○○保守契約",
            amount: 100000,
            manager_id: null,
            display_order: 0,
          },
        ],
        isFetching: false,
      });
      confirmAction.mockResolvedValue(true);

      renderWithMantine(
        <BudgetDeclarationForm
          opened
          onClose={vi.fn()}
          targetMonth="2026-10"
          team="開発チーム"
          declarationId={null}
          teamLocked
          memberList={testMemberList}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await vi.waitFor(() =>
        expect(saveMutation.mutateAsync).toHaveBeenCalled(),
      );

      expect(saveMutation.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            {
              entry_type: "expense",
              category: "外注費",
              description: "○○保守契約",
              amount: 100000,
              manager_id: null,
            },
          ],
        }),
      );
    });
  });
});
