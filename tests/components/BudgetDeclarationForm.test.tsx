// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BudgetDeclarationForm from "@/app/components/budgetDeclarations/BudgetDeclarationForm";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const {
  useBudgetDeclarationDetail,
  saveMutation,
  deleteMutation,
  confirmAction,
  notifyError,
} = vi.hoisted(() => ({
  useBudgetDeclarationDetail: vi.fn(),
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
  useSaveBudgetDeclaration: () => saveMutation,
  useDeleteBudgetDeclaration: () => deleteMutation,
}));

vi.mock("@/app/utils/confirmAction", () => ({ confirmAction }));
vi.mock("@/app/utils/notify", () => ({
  notifyError,
  notifySuccess: vi.fn(),
  toErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

const emptyDetail = () => ({
  data: undefined,
  isLoading: false,
  isError: false,
});

describe("BudgetDeclarationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBudgetDeclarationDetail.mockReturnValue(emptyDetail());
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
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    await vi.waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(deleteMutation.mutateAsync).not.toHaveBeenCalled();
  });
});
