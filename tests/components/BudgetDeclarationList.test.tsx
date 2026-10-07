// @vitest-environment jsdom

import { fireEvent, screen, within } from "@testing-library/react";
import { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import BudgetDeclarationList from "@/app/components/budgetDeclarations/BudgetDeclarationList";
import { BudgetDeclarationStatusType } from "@/app/types/types";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const {
  useBudgetDeclarationList,
  useBudgetDeclarationDetail,
  usePreviousBudgetDeclarationItems,
  useBudgetClosings,
  saveMutation,
  deleteMutation,
  closeMutation,
  reopenMutation,
} = vi.hoisted(() => ({
  useBudgetClosings: vi.fn(),
  closeMutation: { mutateAsync: vi.fn(), isPending: false },
  reopenMutation: { mutateAsync: vi.fn(), isPending: false },
  useBudgetDeclarationList: vi.fn(),
  useBudgetDeclarationDetail: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
  })),
  usePreviousBudgetDeclarationItems: vi.fn(() => ({
    data: null,
    isLoading: false,
    isError: false,
  })),
  saveMutation: { mutateAsync: vi.fn(), isPending: false },
  deleteMutation: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("@/app/hooks/useBudgetDeclarationData", () => ({
  useBudgetDeclarationList,
  useBudgetDeclarationDetail,
  usePreviousBudgetDeclarationItems,
  useSaveBudgetDeclaration: () => saveMutation,
  useDeleteBudgetDeclaration: () => deleteMutation,
  useBudgetClosings,
  useCloseBudgetDeclarationMonth: () => closeMutation,
  useReopenBudgetDeclarationMonth: () => reopenMutation,
}));

// Server Action used by BudgetDeclarationForm to auto-insert recurring items. Via "use server" it pulls in
// profiles.ts requestCache (React cache()) and fails to initialize in tests, so mock it
// (same reason as budgetDeclarationReminderSettings).
vi.mock("@/app/hooks/useBudgetRecurringItemData", () => ({
  useActiveBudgetRecurringItems: () => ({ data: [], isFetching: false }),
}));

// Server Action imported directly by BudgetDeclarationReminderSettings. Mocked for the same reason
// (requestCache / React cache()); never called since this test does not save.
vi.mock("@/app/utils/supabase/budgetDeclarationReminderSettings", () => ({
  updateBudgetDeclarationReminderDays: vi.fn(),
}));

// The month picker is a Mantine calendar (cumbersome to drive); stub it so a click changes the month.
vi.mock("@/app/components/CustomMonthPicker", () => ({
  CustomMonthPicker: ({
    onChange,
    withNavigation,
  }: {
    onChange: (month: string | null) => void;
    withNavigation?: boolean;
  }) => (
    <>
      <button type="button" onClick={() => onChange("2026-11")}>
        月を変更
      </button>
      {withNavigation && (
        <button type="button" onClick={() => onChange("2026-11")}>
          翌月
        </button>
      )}
    </>
  ),
}));

const row = (
  overrides: Partial<BudgetDeclarationStatusType> = {},
): BudgetDeclarationStatusType => ({
  team: "開発チーム",
  declarationId: 1,
  status: "declared",
  itemCount: 1,
  declaredByName: "山田",
  updatedAt: "2026-08-20T10:00:00+09:00",
  summary: { incomeTotal: 100000, expenseTotal: 0, balance: 100000 },
  ...overrides,
});

// Table and card layouts are both in the DOM (CSS picks one); the tests target the desktop table.
const desk = () => within(screen.getByRole("table"));
const cards = () => within(screen.getByTestId("budget-card-list"));

const closing = (month: string) => ({
  month,
  closedAt: "2026-09-21T10:00:00+09:00",
  closedByName: "経理太郎",
});

const setClosings = (
  closings: ReturnType<typeof closing>[] = [],
  isUnknown = false,
  isLoadFailed = false,
) => {
  useBudgetClosings.mockReturnValue({
    closingByMonth: new Map(closings.map((c) => [c.month, c])),
    isUnknown,
    isLoadFailed,
  });
};

const renderList = (
  rows: BudgetDeclarationStatusType[],
  {
    isPlaceholderData = false,
    isFetching = false,
    isStale = false,
    closings = [],
    closingUnknown = false,
    closingLoadFailed = false,
    props,
  }: {
    isPlaceholderData?: boolean;
    isFetching?: boolean;
    isStale?: boolean;
    closings?: ReturnType<typeof closing>[];
    closingUnknown?: boolean;
    closingLoadFailed?: boolean;
    props?: Partial<ComponentProps<typeof BudgetDeclarationList>>;
  } = {},
) => {
  setClosings(closings, closingUnknown, closingLoadFailed);
  useBudgetDeclarationList.mockReturnValue({
    data: rows,
    isLoading: false,
    isError: false,
    error: null,
    isPlaceholderData,
    isFetching,
    isStale,
  });

  return renderWithMantine(
    <BudgetDeclarationList
      initialMonth="2026-10"
      initialData={null}
      initialDataUpdatedAt={Date.now()}
      profileClass="accounting"
      isTeamleader={false}
      memberList={[]}
      {...props}
    />,
  );
};

describe("BudgetDeclarationList", () => {
  it("月切替直後（isPlaceholderData）は行の操作ボタンを無効化する", () => {
    renderList([row()], { isPlaceholderData: true });

    expect(desk().getByRole("button", { name: "明細を表示" })).toBeDisabled();
    expect(desk().getByRole("button", { name: "編集する" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "すべて開く" })).toBeDisabled();
  });

  it("通常時（isPlaceholderData=false）は行の操作ボタンが有効", () => {
    renderList([row()]);

    expect(
      desk().getByRole("button", { name: "明細を表示" }),
    ).not.toBeDisabled();
    expect(desk().getByRole("button", { name: "編集する" })).not.toBeDisabled();
    expect(screen.queryByRole("status", { name: "読み込み中" })).toBeNull();
  });

  it("月切替中（isPlaceholderData）は前月の一覧を残したまま読み込み中を表示する", () => {
    renderList([row({ team: "開発チーム" })], { isPlaceholderData: true });

    expect(screen.getAllByText("開発チーム").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("status", { name: "読み込み中" }),
    ).toBeInTheDocument();
  });

  it("キャッシュ済みだが stale な月の再取得中（isFetching かつ isStale）も読み込み中を表示する", () => {
    renderList([row({ team: "開発チーム" })], {
      isFetching: true,
      isStale: true,
    });

    expect(screen.getAllByText("開発チーム").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("status", { name: "読み込み中" }),
    ).toBeInTheDocument();
  });

  it("再取得中でも stale でなければ読み込み中を表示しない", () => {
    renderList([row()], { isFetching: true, isStale: false });

    expect(screen.queryByRole("status", { name: "読み込み中" })).toBeNull();
  });

  it("モバイル用のカードにチーム・状況・金額・申告者と操作ボタンを表示する", () => {
    renderList([
      row({
        team: "開発チーム",
        status: "declared",
        declaredByName: "山田太郎",
        summary: { incomeTotal: 100000, expenseTotal: 130000, balance: -30000 },
      }),
    ]);

    const card = cards();
    expect(card.getByText("開発チーム")).toBeInTheDocument();
    expect(card.getByText("申告済み")).toBeInTheDocument();
    expect(card.getByText("￥100,000")).toBeInTheDocument();
    expect(card.getByText("￥130,000")).toBeInTheDocument();
    expect(card.getByText("-￥30,000").className).toContain("text-red-600");
    expect(card.getByText(/山田太郎/)).toBeInTheDocument();
    expect(card.getByRole("button", { name: "明細を表示" })).toBeEnabled();
    expect(card.getByRole("button", { name: "編集する" })).toBeEnabled();
  });

  it("モバイル用のカードでも明細の開閉ができる", () => {
    renderList([row({ team: "開発チーム", declarationId: 1 })]);

    fireEvent.click(cards().getByRole("button", { name: "明細を表示" }));
    expect(cards().getByText("申告が見つかりません")).toBeInTheDocument();

    fireEvent.click(cards().getByRole("button", { name: "閉じる" }));
    expect(cards().queryByText("申告が見つかりません")).not.toBeInTheDocument();
  });

  it("フォームを開いた後に月を変えても、開いているフォームの対象月は変わらない", () => {
    renderList([row()]);

    fireEvent.click(desk().getByRole("button", { name: "編集する" }));
    expect(screen.getByDisplayValue("2026年10月")).toBeInTheDocument();

    // Mantine sets aria-hidden on the background while the modal is open, so query with hidden: true
    // (real browsers cannot click the background; this only checks the logic).
    fireEvent.click(
      screen.getByRole("button", { name: "月を変更", hidden: true }),
    );

    expect(screen.getByDisplayValue("2026年10月")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("2026年11月")).not.toBeInTheDocument();
  });

  it("canManageReminderSettings が false のときはリマインド設定ボタンを表示しない", () => {
    renderList([row()], { props: { initialReminderDays: [] } });

    expect(
      screen.queryByRole("button", { name: "リマインド設定" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("リマインド無効")).not.toBeInTheDocument();
  });

  it("申告済みチームが0件のときは「すべて開く」を無効化する", () => {
    renderList([
      row({
        team: "未申告チーム",
        declarationId: null,
        status: "notDeclared",
        itemCount: 0,
        declaredByName: null,
        updatedAt: null,
        summary: { incomeTotal: 0, expenseTotal: 0, balance: 0 },
      }),
    ]);

    expect(screen.getByRole("button", { name: "すべて開く" })).toBeDisabled();
  });

  it("「すべて開く」で申告済みの全チームの明細パネルが同時に表示され、「すべて閉じる」で全て閉じる", () => {
    renderList([
      row({ team: "開発チーム", declarationId: 1 }),
      row({ team: "広報チーム", declarationId: 2 }),
      row({
        team: "未申告チーム",
        declarationId: null,
        status: "notDeclared",
        itemCount: 0,
        declaredByName: null,
        updatedAt: null,
        summary: { incomeTotal: 0, expenseTotal: 0, balance: 0 },
      }),
    ]);

    expect(desk().queryByText("申告が見つかりません")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "すべて開く" }));
    expect(desk().getAllByText("申告が見つかりません")).toHaveLength(2);
    expect(
      desk().getByRole("button", { name: "明細を表示" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "すべて閉じる" }));
    expect(desk().queryByText("申告が見つかりません")).not.toBeInTheDocument();
  });

  it("個別の「明細を表示 / 閉じる」で複数チームを個別に開いたままにできる", () => {
    renderList([
      row({ team: "開発チーム", declarationId: 1 }),
      row({ team: "広報チーム", declarationId: 2 }),
    ]);

    const showButtons = desk().getAllByRole("button", { name: "明細を表示" });
    fireEvent.click(showButtons[0]);
    expect(desk().getAllByText("申告が見つかりません")).toHaveLength(1);

    fireEvent.click(desk().getByRole("button", { name: "明細を表示" }));
    expect(desk().getAllByText("申告が見つかりません")).toHaveLength(2);

    fireEvent.click(desk().getAllByRole("button", { name: "閉じる" })[0]);
    expect(desk().getAllByText("申告が見つかりません")).toHaveLength(1);
  });

  it("月を切り替えると開閉状態がリセットされる", () => {
    renderList([row({ team: "開発チーム", declarationId: 1 })]);

    fireEvent.click(desk().getByRole("button", { name: "明細を表示" }));
    expect(desk().getByText("申告が見つかりません")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "月を変更" }));

    expect(desk().queryByText("申告が見つかりません")).not.toBeInTheDocument();
    expect(
      desk().getByRole("button", { name: "明細を表示" }),
    ).toBeInTheDocument();
  });

  it("翌月ボタンで月を切り替えても開閉状態がリセットされる", () => {
    renderList([row({ team: "開発チーム", declarationId: 1 })]);

    fireEvent.click(desk().getByRole("button", { name: "明細を表示" }));
    expect(desk().getByText("申告が見つかりません")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "翌月" }));

    expect(desk().queryByText("申告が見つかりません")).not.toBeInTheDocument();
  });

  it("申告を削除して同じチームを再申告しても、別 ID の明細パネルが勝手に開かない", () => {
    // Simulate a refetch after the "開発チーム" declaration was deleted (declarationId: null) and
    // re-filed under another id (99).
    const { rerender } = renderList([
      row({ team: "開発チーム", declarationId: 1 }),
    ]);

    fireEvent.click(desk().getByRole("button", { name: "明細を表示" }));
    expect(desk().getByText("申告が見つかりません")).toBeInTheDocument();

    useBudgetDeclarationList.mockReturnValue({
      data: [
        row({
          team: "開発チーム",
          declarationId: null,
          status: "notDeclared",
          itemCount: 0,
          declaredByName: null,
          updatedAt: null,
          summary: { incomeTotal: 0, expenseTotal: 0, balance: 0 },
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      isPlaceholderData: false,
    });
    rerender(
      <BudgetDeclarationList
        initialMonth="2026-10"
        isTeamleader={false}
        initialData={null}
        initialDataUpdatedAt={Date.now()}
        profileClass="accounting"
        memberList={[]}
      />,
    );

    expect(desk().queryByText("申告が見つかりません")).not.toBeInTheDocument();
    expect(desk().getByRole("button", { name: "明細を表示" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "すべて閉じる" })).toBeDisabled();

    useBudgetDeclarationList.mockReturnValue({
      data: [row({ team: "開発チーム", declarationId: 99 })],
      isLoading: false,
      isError: false,
      error: null,
      isPlaceholderData: false,
    });
    rerender(
      <BudgetDeclarationList
        initialMonth="2026-10"
        isTeamleader={false}
        initialData={null}
        initialDataUpdatedAt={Date.now()}
        profileClass="accounting"
        memberList={[]}
      />,
    );

    expect(desk().queryByText("申告が見つかりません")).not.toBeInTheDocument();
    expect(
      desk().getByRole("button", { name: "明細を表示" }),
    ).toBeInTheDocument();
  });

  it("canManageReminderSettings が true のときは「定期明細を管理」と同じ行にリマインド設定ボタンを表示し、設定は常時展開しない", async () => {
    renderList([row()], {
      props: {
        canManageReminderSettings: true,
        initialReminderDays: [15, 18, 20].map((day) => ({
          day,
          message: "文面",
        })),
      },
    });

    const reminderButton = screen.getByRole("button", {
      name: "リマインド設定",
    });
    const recurringButton = screen.getByRole("link", {
      name: "定期明細を管理",
    });
    expect(
      recurringButton.parentElement?.contains(reminderButton),
    ).toBeTruthy();
    expect(
      screen.queryByRole("checkbox", { name: "15" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("リマインド無効")).not.toBeInTheDocument();

    fireEvent.click(reminderButton);

    expect(await screen.findByRole("checkbox", { name: "15" })).toBeChecked();
  });

  it("canManageReminderSettings が true で保存済みの対象日が0件のときは「リマインド無効」バッジを表示する", () => {
    renderList([row()], {
      props: {
        canManageReminderSettings: true,
        initialReminderDays: [],
      },
    });

    expect(
      screen.getByRole("button", { name: "リマインド設定" }),
    ).toBeInTheDocument();
    expect(screen.getByText("リマインド無効")).toBeInTheDocument();
  });

  it("画面上部に全チーム合計（収入・支出・収支）を表示し、テーブルのフッター合計は無い", () => {
    renderList([
      row({
        team: "開発チーム",
        declarationId: 1,
        summary: { incomeTotal: 300000, expenseTotal: 100000, balance: 200000 },
      }),
      row({
        team: "広報チーム",
        declarationId: 2,
        summary: { incomeTotal: 0, expenseTotal: 500000, balance: -500000 },
      }),
    ]);

    expect(screen.getByTestId("budget-total-income")).toHaveTextContent(
      "300,000",
    );
    expect(screen.getByTestId("budget-total-expense")).toHaveTextContent(
      "600,000",
    );
    expect(screen.getByTestId("budget-total-balance")).toHaveTextContent(
      "300,000",
    );
    expect(screen.queryByText("合計")).not.toBeInTheDocument();
  });

  it("状態バッジは 未申告 / 入力中 / 申告済み を区別し、入力中の金額も表示する", () => {
    renderList([
      row({ team: "開発チーム", status: "declared" }),
      row({
        team: "広報チーム",
        declarationId: 2,
        status: "inProgress",
        summary: { incomeTotal: 30000, expenseTotal: 0, balance: 30000 },
      }),
      row({
        team: "営業チーム",
        declarationId: null,
        status: "notDeclared",
        itemCount: 0,
        declaredByName: null,
        updatedAt: null,
        summary: { incomeTotal: 0, expenseTotal: 0, balance: 0 },
      }),
    ]);

    expect(desk().getByText("申告済み")).toBeInTheDocument();
    expect(desk().getByText("入力中")).toBeInTheDocument();
    expect(desk().getByText("未申告")).toBeInTheDocument();
    expect(screen.getAllByText(/30,000/).length).toBeGreaterThan(0);
    expect(desk().getAllByRole("button", { name: "編集する" })).toHaveLength(2);
    expect(desk().getAllByRole("button", { name: "申告する" })).toHaveLength(1);
  });

  it("明細 0 件で申告済みにした行は「明細なし」と表示する", () => {
    renderList([
      row({
        team: "広報チーム",
        declarationId: 2,
        status: "declared",
        itemCount: 0,
        summary: { incomeTotal: 0, expenseTotal: 0, balance: 0 },
      }),
      row({ team: "開発チーム", status: "declared", itemCount: 2 }),
    ]);

    expect(desk().getAllByText("明細なし")).toHaveLength(1);
  });

  it("収支がマイナスのときは赤字で表示する", () => {
    renderList([
      row({
        summary: { incomeTotal: 0, expenseTotal: 500000, balance: -500000 },
      }),
    ]);

    expect(
      screen.getByTestId("budget-total-balance").getAttribute("style"),
    ).toContain("red");
  });

  it("チームリーダー: 他チーム行は「明細を表示」のみで、編集ボタンは自チーム行だけに出る", () => {
    renderList(
      [
        row({ team: "開発チーム", declarationId: 1 }),
        row({ team: "広報チーム", declarationId: 2 }),
      ],
      {
        props: {
          profileClass: "public",
          isTeamleader: true,
          profileTeam: "開発チーム",
        },
      },
    );

    expect(desk().getAllByRole("button", { name: "明細を表示" })).toHaveLength(
      2,
    );
    expect(desk().getAllByRole("button", { name: "編集する" })).toHaveLength(1);
    expect(desk().getByText("閲覧のみ")).toBeInTheDocument();
  });

  it("確定済みの月は確定情報を表示し、全ロールで編集ボタンを無効化する", () => {
    renderList([row()], { closings: [closing("2026-10")] });

    expect(screen.getByText("確定済み")).toBeInTheDocument();
    expect(screen.getByText(/経理太郎/)).toBeInTheDocument();
    expect(desk().getByRole("button", { name: "編集する" })).toBeDisabled();
    expect(
      screen.getAllByText(/確定済みのため、作成・編集・削除できません/).length,
    ).toBeGreaterThan(0);
  });

  it("未確定の月は確定スイッチを経理・管理者（canCloseMonth）にだけ表示する", () => {
    renderList([row()], { props: { canCloseMonth: true } });
    expect(screen.getByRole("switch", { name: "確定済み" })).not.toBeChecked();
  });

  it("チームリーダー（canCloseMonth=false）には確定スイッチを表示しない", () => {
    renderList([row()], { closings: [closing("2026-10")] });
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("確定状態を取得できないときは「未確定」と表示せず、警告を出して編集を無効化する", () => {
    renderList([row()], {
      closingUnknown: true,
      closingLoadFailed: true,
      props: { canCloseMonth: true },
    });

    expect(
      screen.getByText("確定状態を取得できませんでした"),
    ).toBeInTheDocument();
    expect(screen.queryByText("この月は未確定です。")).not.toBeInTheDocument();
    expect(desk().getByRole("button", { name: "編集する" })).toBeDisabled();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("確定状態の取得中は失敗の警告を出さず「確認中」と表示し、編集は無効のままにする", () => {
    renderList([row()], {
      closingUnknown: true,
      closingLoadFailed: false,
      props: { canCloseMonth: true },
    });

    expect(screen.getByText("確定状態を確認中です…")).toBeInTheDocument();
    expect(
      screen.queryByText("確定状態を取得できませんでした"),
    ).not.toBeInTheDocument();
    expect(desk().getByRole("button", { name: "編集する" })).toBeDisabled();
  });

  it("所属チーム未設定のチームリーダーには、編集できない理由を案内する", () => {
    renderList([row()], {
      props: { profileClass: "public", isTeamleader: true, profileTeam: null },
    });

    expect(screen.getByText("所属チームが未設定です")).toBeInTheDocument();
    expect(
      desk().queryByRole("button", { name: "編集する" }),
    ).not.toBeInTheDocument();
  });

  it("所属チームのあるチームリーダーには未設定の案内を出さない", () => {
    renderList([row()], {
      props: {
        profileClass: "public",
        isTeamleader: true,
        profileTeam: "開発チーム",
      },
    });

    expect(
      screen.queryByText("所属チームが未設定です"),
    ).not.toBeInTheDocument();
  });

  it("フォームを開いたまま月が確定されたら、開いているフォームを保存・削除できなくする", () => {
    const { rerender } = renderList([row()]);

    fireEvent.click(desk().getByRole("button", { name: "編集する" }));
    expect(
      screen.queryByText("この月は編集できません"),
    ).not.toBeInTheDocument();

    setClosings([closing("2026-10")]);
    rerender(
      <BudgetDeclarationList
        initialMonth="2026-10"
        isTeamleader={false}
        initialData={null}
        initialDataUpdatedAt={Date.now()}
        profileClass="accounting"
        memberList={[]}
      />,
    );

    expect(
      screen.getByText("この月は編集できません", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });
});
