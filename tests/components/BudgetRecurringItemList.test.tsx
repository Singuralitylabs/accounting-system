// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { optionsAtom } from "@/app/atoms/optionsAtom";
import BudgetRecurringItemList from "@/app/components/budgetDeclarations/BudgetRecurringItemList";
import { BudgetRecurringItemType } from "@/app/types/types";
import { notifyError, notifySuccess } from "@/app/utils/notify";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const { useBudgetRecurringItemList, saveMutation, confirmAction } = vi.hoisted(
  () => ({
    useBudgetRecurringItemList: vi.fn(),
    saveMutation: {
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    },
    confirmAction: vi.fn(),
  }),
);

vi.mock("@/app/hooks/useBudgetRecurringItemData", () => ({
  useBudgetRecurringItemList,
  useSaveBudgetRecurringItems: () => saveMutation,
}));

vi.mock("@/app/utils/confirmAction", () => ({ confirmAction }));
vi.mock("@/app/utils/notify", () =>
  import("../testUtils/mockNotify").then((m) => m.mockNotify()),
);

const testMemberList = [
  { value: "1", label: "山田太郎" },
  { value: "2", label: "鈴木花子" },
];

const existingRow: BudgetRecurringItemType = {
  id: 1,
  team: "開発チーム",
  entry_type: "expense",
  category: "外注費",
  description: "○○保守契約",
  amount: 100000,
  manager_id: null,
  start_month: "2026-04-01",
  end_month: null,
  display_order: 0,
  inserted_at: "",
  updated_at: "",
};

const renderList = (
  overrides: Partial<ComponentProps<typeof BudgetRecurringItemList>> = {},
) => {
  const store = createStore();
  store.set(optionsAtom, {
    teamList: ["開発チーム", "経理チーム"],
    categoryList: ["セミナー", "受託案件"],
    itemList: ["外注費", "ツール利用料"],
    certificateList: [],
  });

  return renderWithMantine(
    <Provider store={store}>
      <BudgetRecurringItemList
        initialData={[existingRow]}
        canEditAllTeams={false}
        ownTeam="開発チーム"
        teamList={["開発チーム", "経理チーム"]}
        memberList={testMemberList}
        {...overrides}
      />
    </Provider>,
  );
};

describe("BudgetRecurringItemList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBudgetRecurringItemList.mockReturnValue({ data: [existingRow] });
    saveMutation.isPending = false;
  });

  it("既存の定期明細行を表示する", () => {
    renderList();

    expect(screen.getByDisplayValue("○○保守契約")).toBeInTheDocument();
  });

  it("チームリーダー（canEditAllTeams=false）はチーム Select が無効化される", () => {
    renderList();

    const teamInput = screen.getAllByDisplayValue("開発チーム")[0];
    expect(teamInput).toBeDisabled();
  });

  it("行を追加・削除できる", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "定期明細追加" }));
    expect(screen.getAllByRole("button", { name: "削除" })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "削除" })[1]);
    expect(screen.getAllByRole("button", { name: "削除" })).toHaveLength(1);
  });

  it("必須項目が未入力のまま保存すると案内を出し、保存処理を呼ばない", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "定期明細追加" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(notifyError).toHaveBeenCalledWith(
      "チーム・種別・分類・内容・適用開始月は必須です。",
    );
    expect(saveMutation.mutateAsync).not.toHaveBeenCalled();
    expect(confirmAction).not.toHaveBeenCalled();
  });

  it("確認後に一括保存する", async () => {
    confirmAction.mockResolvedValue(true);
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await vi.waitFor(() => expect(saveMutation.mutateAsync).toHaveBeenCalled());

    expect(saveMutation.mutateAsync).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 1,
        description: "○○保守契約",
        isNew: false,
        isRemoved: false,
      }),
    ]);
    // 成功通知はミューテーションの onSuccess 側のみが出す。
    // ここ（コンポーネント側）で重ねて notifySuccess を呼ぶと保存成功時に
    // 通知が二重に表示されてしまう
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it("保存の確認をキャンセルすると保存処理を呼ばない", async () => {
    confirmAction.mockResolvedValue(false);
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await vi.waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(saveMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("経理・管理者（canEditAllTeams=true）は新規行のチームを選択できる", () => {
    renderList({ canEditAllTeams: true, ownTeam: null });

    fireEvent.click(screen.getByRole("button", { name: "定期明細追加" }));
    const teamInputs = screen.getAllByDisplayValue("開発チーム");
    // 新規行のチーム Select は disabled ではない
    expect(teamInputs[teamInputs.length - 1]).not.toBeDisabled();
  });

  it("チームマスタから外れた既存行のチームも空欄にならず表示される", () => {
    const orphanRow: BudgetRecurringItemType = {
      ...existingRow,
      id: 2,
      team: "旧チーム",
    };
    useBudgetRecurringItemList.mockReturnValue({ data: [orphanRow] });

    renderList({
      initialData: [orphanRow],
      canEditAllTeams: true,
      ownTeam: null,
    });

    // teamList（マスタ）に無い値でも、Select の表示値としてそのまま見える
    // （保存される値自体も変わらない）。空欄のままだと「担当チームが
    // クリアされた」と誤認させてしまう。Mantine の Select は 1 行につき
    // 複数要素が同じ表示値を持ちうるため getAllByDisplayValue で確認する
    // （チームリーダー無効化のテストと同方針）
    expect(screen.getAllByDisplayValue("旧チーム").length).toBeGreaterThan(0);
  });

  it("マスタに無い分類の既存行は警告を表示し、保存を止める（Issue #116）", () => {
    const orphanRow: BudgetRecurringItemType = {
      ...existingRow,
      id: 2,
      category: "旧品目",
    };
    useBudgetRecurringItemList.mockReturnValue({ data: [orphanRow] });

    renderList({ initialData: [orphanRow] });

    expect(screen.getByText("分類の見直しが必要です")).toBeInTheDocument();
    expect(
      screen.getByText("マスタ未登録のため選び直してください"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(notifyError).toHaveBeenCalledWith(
      "分類がマスタに登録されていない行があります。選び直してください。",
    );
    expect(saveMutation.mutateAsync).not.toHaveBeenCalled();
    expect(confirmAction).not.toHaveBeenCalled();
  });
});
