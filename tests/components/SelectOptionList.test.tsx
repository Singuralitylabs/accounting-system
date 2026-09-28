// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SelectOptionList from "@/app/components/SelectOptionList";
import { notifyError } from "@/app/utils/notify";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const { bulkUpsertSelectOptions, confirmAction, refresh } = vi.hoisted(() => ({
  bulkUpsertSelectOptions: vi.fn(),
  confirmAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/utils/supabase/selectOptions", () => ({
  bulkUpsertSelectOptions,
}));
vi.mock("@/app/utils/confirmAction", () => ({ confirmAction }));
vi.mock("@/app/utils/notify", () =>
  import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const optionList = [
  { id: 1, value: "チームA", display_order: 1, is_active: true },
];

const editOption = () =>
  fireEvent.change(screen.getByDisplayValue("チームA"), {
    target: { value: "チームA2" },
  });

describe("SelectOptionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmAction.mockResolvedValue(true);
  });

  // 同じページのユーザーリストはサーバ取得の選択肢を props で受け取るため、
  // 保存後に Server Component を再描画しないと新しいチームが候補に出ない
  it("保存に成功したらページを refresh して最新の選択肢を反映する", async () => {
    bulkUpsertSelectOptions.mockResolvedValue({ insertedIds: [] });
    renderWithMantine(
      <SelectOptionList optionClass="team" optionList={optionList} />,
    );

    // 未保存の変更が無い間は「更新」を押せないため、項目名を編集してから押す
    editOption();
    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(bulkUpsertSelectOptions).toHaveBeenCalledWith(
      "team",
      expect.any(Array),
    );
  });

  it("保存に失敗した場合は refresh しない", async () => {
    bulkUpsertSelectOptions.mockRejectedValue(new Error("failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithMantine(
      <SelectOptionList optionClass="team" optionList={optionList} />,
    );

    // 未保存の変更が無い間は「更新」を押せないため、項目名を編集してから押す
    editOption();
    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("確認ダイアログでキャンセルした場合は保存も refresh もしない", async () => {
    confirmAction.mockResolvedValue(false);
    renderWithMantine(
      <SelectOptionList optionClass="team" optionList={optionList} />,
    );

    // 未保存の変更が無い間は「更新」を押せないため、項目名を編集してから押す
    editOption();
    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => expect(confirmAction).toHaveBeenCalled());
    expect(bulkUpsertSelectOptions).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("サーバの選択肢が変わったら、未保存の変更が無ければ同期し、編集中なら編集内容を保つ", () => {
    const { rerender } = renderWithMantine(
      <SelectOptionList optionClass="team" optionList={optionList} />,
    );
    const refreshed = [
      { id: 1, value: "チームA", display_order: 1, is_active: true },
      { id: 2, value: "チームB", display_order: 2, is_active: true },
    ];

    rerender(<SelectOptionList optionClass="team" optionList={refreshed} />);
    expect(screen.getByDisplayValue("チームB")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("チームA"), {
      target: { value: "チームA2" },
    });
    rerender(
      <SelectOptionList
        optionClass="team"
        optionList={[
          ...refreshed,
          { id: 3, value: "チームC", display_order: 3, is_active: true },
        ]}
      />,
    );
    expect(screen.getByDisplayValue("チームA2")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("チームC")).not.toBeInTheDocument();
  });

  it("編集中に届いた保存前の選択肢は、そのカードの保存の成功後に反映しない（保存した値のまま）", async () => {
    const teamOptions = [
      { id: 1, value: "チームA", display_order: 1, is_active: true },
    ];
    const categoryOptions = [
      { id: 11, value: "開発", display_order: 1, is_active: true },
    ];
    const renderCards = (
      team: typeof teamOptions,
      category: typeof categoryOptions,
    ) => (
      <>
        <SelectOptionList optionClass="team" optionList={team} />
        <SelectOptionList optionClass="category" optionList={category} />
      </>
    );
    bulkUpsertSelectOptions.mockResolvedValue({ insertedIds: [] });
    const { rerender } = renderWithMantine(
      renderCards(teamOptions, categoryOptions),
    );

    // 2 枚のカードを編集し、分類（B）だけを保存する
    fireEvent.change(screen.getByDisplayValue("チームA"), {
      target: { value: "チームA2" },
    });
    fireEvent.change(screen.getByDisplayValue("開発"), {
      target: { value: "開発2" },
    });
    const [teamSaveButton, categorySaveButton] = screen.getAllByRole("button", {
      name: "更新",
    });
    fireEvent.click(categorySaveButton);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    // B の refresh の応答（チームは保存前の内容の新しい配列）が、チームの編集中に届く
    rerender(
      renderCards(
        [{ id: 1, value: "チームA", display_order: 1, is_active: true }],
        [{ id: 11, value: "開発2", display_order: 1, is_active: true }],
      ),
    );
    expect(screen.getByDisplayValue("チームA2")).toBeInTheDocument();

    // チーム（A）を保存しても、届いていた保存前の内容で表示を戻さない
    fireEvent.click(teamSaveButton);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(screen.getByDisplayValue("チームA2")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("チームA")).not.toBeInTheDocument();
  });

  describe("保存で追加した行（再取得が届く前に続けて編集した場合）", () => {
    type SentOption = {
      id: number;
      value: string;
      display_order: number | null;
      is_active: boolean | null;
      isNew: boolean;
    };
    // bulkUpsertSelectOptions と同じく、有効な追加行を 1 行ずつ INSERT したものとして
    // DB の id（100 から）を返す
    let nextDbId = 100;
    const insertedValues: string[] = [];
    const sentOptions = (call: number): SentOption[] =>
      bulkUpsertSelectOptions.mock.calls[call][1];

    beforeEach(() => {
      nextDbId = 100;
      insertedValues.length = 0;
      bulkUpsertSelectOptions.mockImplementation(
        async (_optionClass: string, options: SentOption[]) => ({
          insertedIds: options
            .filter((option) => option.isNew && option.is_active)
            .map((option) => {
              insertedValues.push(option.value);
              return { tempId: option.id, id: nextDbId++ };
            }),
        }),
      );
    });

    const addAndSaveTeamB = async () => {
      fireEvent.click(screen.getByRole("button", { name: "チーム追加" }));
      fireEvent.change(screen.getByDisplayValue(""), {
        target: { value: "チームB" },
      });
      fireEvent.click(screen.getByRole("button", { name: "更新" }));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    };

    it("保存後、再取得（refresh の結果）が届く前に別の項目を編集して保存しても、追加した行を再び INSERT しない", async () => {
      renderWithMantine(
        <SelectOptionList optionClass="team" optionList={optionList} />,
      );
      await addAndSaveTeamB();
      expect(sentOptions(0)).toContainEqual(
        expect.objectContaining({ value: "チームB", isNew: true }),
      );
      // 保存した状態が基準になり、未保存の変更は無い
      expect(screen.getByRole("button", { name: "更新" })).toBeDisabled();

      // refresh の結果が届く前（props は保存前のまま）に既存の項目を編集して保存する
      editOption();
      fireEvent.click(screen.getByRole("button", { name: "更新" }));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));

      // 追加した行は DB の id で保存済みの行（UPDATE）として送られ、INSERT は 1 回だけ
      expect(sentOptions(1)).toContainEqual(
        expect.objectContaining({ id: 100, value: "チームB", isNew: false }),
      );
      expect(sentOptions(1).some((option) => option.isNew)).toBe(false);
      expect(insertedValues).toEqual(["チームB"]);
    });

    it("保存後、再取得が届く前に追加した行を削除して保存すると、DB の行の削除（無効化）として送る", async () => {
      renderWithMantine(
        <SelectOptionList optionClass="team" optionList={optionList} />,
      );
      await addAndSaveTeamB();

      // 行の削除ボタン（ドラッグハンドルも role="button" を持つため button 要素で選ぶ）
      const removeButton = screen
        .getByDisplayValue("チームB")
        .closest("tr")
        ?.querySelector("button");
      fireEvent.click(removeButton as HTMLButtonElement);
      expect(screen.queryByDisplayValue("チームB")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "更新" }));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));

      expect(sentOptions(1)).toContainEqual(
        expect.objectContaining({ id: 100, isNew: false, is_active: false }),
      );
      expect(insertedValues).toEqual(["チームB"]);
    });

    it("保存が途中で失敗しても、INSERT できた行は DB の id に置き換え、保存し直しても再び INSERT しない", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      bulkUpsertSelectOptions.mockImplementationOnce(
        async (_optionClass: string, options: SentOption[]) => {
          const [first] = options.filter((option) => option.isNew);
          insertedValues.push(first.value);
          return {
            insertedIds: [{ tempId: first.id, id: nextDbId++ }],
            error: "選択肢の追加に失敗しました。",
          };
        },
      );
      renderWithMantine(
        <SelectOptionList optionClass="team" optionList={optionList} />,
      );

      fireEvent.click(screen.getByRole("button", { name: "チーム追加" }));
      fireEvent.change(screen.getByDisplayValue(""), {
        target: { value: "チームB" },
      });
      fireEvent.click(screen.getByRole("button", { name: "チーム追加" }));
      fireEvent.change(screen.getByDisplayValue(""), {
        target: { value: "チームC" },
      });
      fireEvent.click(screen.getByRole("button", { name: "更新" }));
      await waitFor(() => expect(notifyError).toHaveBeenCalled());
      expect(refresh).not.toHaveBeenCalled();
      // 一部しか保存できていないため、未保存の変更ありのまま
      expect(screen.getByRole("button", { name: "更新" })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "更新" }));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

      expect(sentOptions(1)).toContainEqual(
        expect.objectContaining({ id: 100, value: "チームB", isNew: false }),
      );
      expect(sentOptions(1)).toContainEqual(
        expect.objectContaining({ value: "チームC", isNew: true }),
      );
      expect(insertedValues).toEqual(["チームB", "チームC"]);
    });
  });

  it("未保存の変更が無い間は「更新」を押せない", () => {
    renderWithMantine(
      <SelectOptionList optionClass="team" optionList={optionList} />,
    );
    const saveButton = screen.getByRole("button", { name: "更新" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByDisplayValue("チームA"), {
      target: { value: "チームA2" },
    });
    expect(saveButton).toBeEnabled();

    fireEvent.change(screen.getByDisplayValue("チームA2"), {
      target: { value: "チームA" },
    });
    expect(saveButton).toBeDisabled();
  });
});
