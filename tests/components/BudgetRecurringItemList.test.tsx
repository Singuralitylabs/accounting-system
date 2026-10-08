// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { optionsAtom } from "@/app/atoms/optionsAtom";
import BudgetRecurringItemList from "@/app/components/budgetDeclarations/BudgetRecurringItemList";
import { BudgetRecurringItemType } from "@/app/types/types";
import { BudgetDeclarationError } from "@/app/utils/budgetDeclaration";
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
  import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
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

  it("他チームの行は閲覧のみ（入力・削除が無効）で、自チームの行は編集できる", () => {
    const otherRow = {
      ...existingRow,
      id: 2,
      team: "経理チーム",
      description: "他チームの契約",
    };
    useBudgetRecurringItemList.mockReturnValue({
      data: [existingRow, otherRow],
    });
    renderList({ initialData: [existingRow, otherRow] });

    expect(screen.getByDisplayValue("他チームの契約")).toBeDisabled();
    expect(screen.getByDisplayValue("○○保守契約")).not.toBeDisabled();
    const deleteButtons = screen.getAllByRole("button", { name: "削除" });
    expect(deleteButtons).toHaveLength(2);
    expect(deleteButtons[0]).not.toBeDisabled();
    expect(deleteButtons[1]).toBeDisabled();
  });

  it("経理・管理者（canEditAllTeams=true）は他チームの行も編集できる", () => {
    const otherRow = {
      ...existingRow,
      id: 2,
      team: "経理チーム",
      description: "他チームの契約",
    };
    useBudgetRecurringItemList.mockReturnValue({
      data: [existingRow, otherRow],
    });
    renderList({
      initialData: [existingRow, otherRow],
      canEditAllTeams: true,
      ownTeam: null,
    });

    expect(screen.getByDisplayValue("他チームの契約")).not.toBeDisabled();
  });

  it("プロフィール取得失敗時は「所属チーム未設定」と誤案内せず、再読み込みを促して保存を無効にする", () => {
    renderList({
      canEditAllTeams: false,
      ownTeam: null,
      profileLoadFailed: true,
    });

    expect(
      screen.getByText("権限情報の取得に失敗しました"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("所属チームが未設定です"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("マスタ未登録の分類エラーは編集できる行にだけ表示する", () => {
    const otherRow = {
      ...existingRow,
      id: 2,
      team: "経理チーム",
      category: "旧分類",
    };
    const own = { ...existingRow, category: "旧分類" };
    useBudgetRecurringItemList.mockReturnValue({ data: [own, otherRow] });
    renderList({ initialData: [own, otherRow] });

    expect(
      screen.getAllByText("マスタ未登録のため選び直してください"),
    ).toHaveLength(1);
  });

  it("所属チームのない閲覧者（ownTeam=null）は全行が閲覧のみで、行の追加も保存もできず、理由を案内する", () => {
    renderList({ ownTeam: null });

    expect(screen.getByText("所属チームが未設定です")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();

    expect(screen.getByDisplayValue("○○保守契約")).toBeDisabled();
    expect(screen.getByRole("button", { name: "定期明細追加" })).toBeDisabled();
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

  it("編集した行だけ isEdited を付けて保存し、触っていない行には付けない", async () => {
    confirmAction.mockResolvedValue(true);
    const second = { ...existingRow, id: 2, description: "△△契約" };
    useBudgetRecurringItemList.mockReturnValue({ data: [existingRow, second] });
    renderList({ initialData: [existingRow, second] });

    fireEvent.change(screen.getByDisplayValue("△△契約"), {
      target: { value: "△△契約（改定）" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await vi.waitFor(() => expect(saveMutation.mutateAsync).toHaveBeenCalled());

    const sent = saveMutation.mutateAsync.mock.calls[0][0];
    expect(sent.find((r: { id: number }) => r.id === 1).isEdited).toBeFalsy();
    expect(sent.find((r: { id: number }) => r.id === 2).isEdited).toBe(true);
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
    // The success notification comes only from the mutation's onSuccess; calling notifySuccess here too
    // would show it twice.
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it("書き込み前の失敗では編集を残す（担当者不存在など）", async () => {
    confirmAction.mockResolvedValue(true);
    saveMutation.mutateAsync.mockRejectedValue(
      new BudgetDeclarationError({
        kind: "validationFailed",
        message:
          "選択された担当者が見つかりません。画面を再読み込みして選び直してください。",
      }),
    );
    renderList();

    fireEvent.change(screen.getByDisplayValue("○○保守契約"), {
      target: { value: "変更後の内容" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await vi.waitFor(() => expect(saveMutation.mutateAsync).toHaveBeenCalled());

    expect(screen.getByDisplayValue("変更後の内容")).toBeInTheDocument();
  });

  it("応答が失われた失敗では編集を捨てて表示を元に戻す", async () => {
    confirmAction.mockResolvedValue(true);
    saveMutation.mutateAsync.mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    renderList();

    fireEvent.change(screen.getByDisplayValue("○○保守契約"), {
      target: { value: "変更後の内容" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await vi.waitFor(() =>
      expect(screen.getByDisplayValue("○○保守契約")).toBeInTheDocument(),
    );
    expect(screen.queryByDisplayValue("変更後の内容")).not.toBeInTheDocument();
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

    // A team missing from teamList must still show as the Select value (blank would look like the team
    // was cleared). A Mantine Select can have several elements with the same display value per row,
    // hence getAllByDisplayValue.
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
