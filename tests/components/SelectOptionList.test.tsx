// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SelectOptionList, {
  baselineAfterPartialSave,
  optionRowsToSave,
} from "@/app/components/SelectOptionList";
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

  // The sibling user list receives server-fetched options via props, so the Server Component
  // must re-render after save for new teams to appear.
  it("保存に成功したらページを refresh して最新の選択肢を反映する", async () => {
    bulkUpsertSelectOptions.mockResolvedValue({ insertedIds: [] });
    renderWithMantine(
      <SelectOptionList optionClass="team" optionList={optionList} />,
    );

    // Update stays disabled until something changes; edit the name first.
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

    // Update stays disabled until something changes; edit the name first.
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

    // Update stays disabled until something changes; edit the name first.
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

    // B's refresh response (stale team array) arrives while the team is being edited.
    rerender(
      renderCards(
        [{ id: 1, value: "チームA", display_order: 1, is_active: true }],
        [{ id: 11, value: "開発2", display_order: 1, is_active: true }],
      ),
    );
    expect(screen.getByDisplayValue("チームA2")).toBeInTheDocument();

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
    // Mimic bulkUpsertSelectOptions: return DB ids (from 100) for each inserted row.
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
      expect(screen.getByRole("button", { name: "更新" })).toBeDisabled();

      // Edit before the refresh result arrives (props still hold the pre-save state).
      editOption();
      fireEvent.click(screen.getByRole("button", { name: "更新" }));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));

      expect(sentOptions(1)).toEqual([
        expect.objectContaining({ id: 1, value: "チームA2", isNew: false }),
      ]);
      expect(insertedValues).toEqual(["チームB"]);
    });

    it("保存後、再取得が届く前に追加した行を削除して保存すると、DB の行の削除（無効化）として送る", async () => {
      renderWithMantine(
        <SelectOptionList optionClass="team" optionList={optionList} />,
      );
      await addAndSaveTeamB();

      // The drag handle also has role="button", so select by button element.
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
            updatedIds: [],
            error: "項目の追加に失敗しました。",
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
      expect(notifyError).toHaveBeenCalledWith(
        "チーム情報の保存に失敗しました。項目の追加に失敗しました。一部の項目は保存済みです。",
      );
      expect(refresh).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "更新" })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "更新" }));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

      expect(sentOptions(1)).toEqual([
        expect.objectContaining({ value: "チームC", isNew: true }),
      ]);
      expect(insertedValues).toEqual(["チームB", "チームC"]);
    });
  });

  it("保存の応答を待つ間に別の行を編集しても、応答後に編集内容を上書きせず「変更あり」のままにする", async () => {
    let resolveSave: (value: unknown) => void = () => {};
    bulkUpsertSelectOptions.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    renderWithMantine(
      <SelectOptionList
        optionClass="team"
        optionList={[
          { id: 1, value: "チームA", display_order: 1, is_active: true },
          { id: 2, value: "チームB", display_order: 2, is_active: true },
        ]}
      />,
    );

    editOption();
    fireEvent.click(screen.getByRole("button", { name: "チーム追加" }));
    fireEvent.change(screen.getByDisplayValue(""), {
      target: { value: "チームC" },
    });
    fireEvent.click(screen.getByRole("button", { name: "更新" }));
    await waitFor(() => expect(bulkUpsertSelectOptions).toHaveBeenCalled());
    const [, sent] = bulkUpsertSelectOptions.mock.calls[0];
    expect(sent).toEqual([
      expect.objectContaining({ id: 1, value: "チームA2", valueChanged: true }),
      expect.objectContaining({ value: "チームC", isNew: true }),
    ]);
    const tempId = sent.find(
      (option: { value: string }) => option.value === "チームC",
    ).id;

    // LoadingOverlay does not trap focus, so another row can be edited while the save is pending.
    fireEvent.change(screen.getByDisplayValue("チームB"), {
      target: { value: "チームB2" },
    });
    resolveSave({ insertedIds: [{ tempId, id: 100 }], updatedIds: [1] });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    expect(screen.getByDisplayValue("チームB2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("チームA2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("チームC")).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "更新" });
    expect(saveButton).toBeEnabled();

    bulkUpsertSelectOptions.mockResolvedValueOnce({
      insertedIds: [],
      updatedIds: [2],
    });
    fireEvent.click(saveButton);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    const [, resent] = bulkUpsertSelectOptions.mock.calls[1];
    expect(resent).toEqual([
      expect.objectContaining({ id: 2, value: "チームB2", isNew: false }),
    ]);
    expect(screen.getByRole("button", { name: "更新" })).toBeDisabled();
  });

  it("同じ名前の項目がある場合は、サーバのメッセージを表示する（何も保存されていなければ「一部の項目は保存済み」を添えない）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const duplicate =
      "「チームZ」と同じ名前の項目が既にあります（削除済みの項目を含む）。名前を変えるか、既存の項目を使ってください。";
    bulkUpsertSelectOptions.mockResolvedValue({
      insertedIds: [],
      updatedIds: [],
      error: duplicate,
    });
    renderWithMantine(
      <SelectOptionList optionClass="team" optionList={optionList} />,
    );

    // Found only on the server: the name collides with a deleted item not shown on screen.
    fireEvent.click(screen.getByRole("button", { name: "チーム追加" }));
    fireEvent.change(screen.getByDisplayValue(""), {
      target: { value: "チームZ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(notifyError).toHaveBeenCalledWith(
      `チーム情報の保存に失敗しました。${duplicate}`,
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("途中まで保存できた場合は、通知に「一部の項目は保存済みです」を添える", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    bulkUpsertSelectOptions.mockResolvedValue({
      insertedIds: [],
      updatedIds: [1],
      error: "項目の更新に失敗しました。",
    });
    renderWithMantine(
      <SelectOptionList
        optionClass="team"
        optionList={[
          { id: 1, value: "チームA", display_order: 1, is_active: true },
          { id: 2, value: "チームB", display_order: 2, is_active: true },
        ]}
      />,
    );

    editOption();
    fireEvent.change(screen.getByDisplayValue("チームB"), {
      target: { value: "チームB2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(notifyError).toHaveBeenCalledWith(
      "チーム情報の保存に失敗しました。項目の更新に失敗しました。一部の項目は保存済みです。",
    );
  });

  it("表示中の項目どうしで名前が重なる場合は、保存せずにエラーを表示する（削除した行は数えない）", async () => {
    bulkUpsertSelectOptions.mockResolvedValue({
      insertedIds: [],
      updatedIds: [1, 2],
    });
    renderWithMantine(
      <SelectOptionList
        optionClass="team"
        optionList={[
          { id: 1, value: "チームA", display_order: 1, is_active: true },
          { id: 2, value: "チームB", display_order: 2, is_active: true },
        ]}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("チームB"), {
      target: { value: "チームA" },
    });
    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(notifyError).toHaveBeenCalledWith(
      "「チームA」が複数あります。項目名が重ならないようにしてください。",
    );
    expect(confirmAction).not.toHaveBeenCalled();
    expect(bulkUpsertSelectOptions).not.toHaveBeenCalled();

    const [first] = screen.getAllByDisplayValue("チームA");
    fireEvent.click(
      first.closest("tr")?.querySelector("button") as HTMLButtonElement,
    );
    fireEvent.click(screen.getByRole("button", { name: "更新" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(bulkUpsertSelectOptions).toHaveBeenCalledTimes(1);
  });

  it("保存が途中で失敗しても、保存できた行は保存済みとして扱い、画面で元に戻したら保存し直せる", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    bulkUpsertSelectOptions.mockResolvedValueOnce({
      insertedIds: [],
      updatedIds: [1],
      error: "項目の追加に失敗しました。",
    });
    renderWithMantine(
      <SelectOptionList optionClass="team" optionList={optionList} />,
    );

    editOption();
    fireEvent.click(screen.getByRole("button", { name: "チーム追加" }));
    fireEvent.change(screen.getByDisplayValue(""), {
      target: { value: "チームB" },
    });
    fireEvent.click(screen.getByRole("button", { name: "更新" }));
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(
        "チーム情報の保存に失敗しました。項目の追加に失敗しました。一部の項目は保存済みです。",
      ),
    );

    fireEvent.change(screen.getByDisplayValue("チームA2"), {
      target: { value: "チームA" },
    });
    fireEvent.click(
      screen
        .getByDisplayValue("チームB")
        .closest("tr")
        ?.querySelector("button") as HTMLButtonElement,
    );
    const saveButton = screen.getByRole("button", { name: "更新" });
    expect(saveButton).toBeEnabled();

    bulkUpsertSelectOptions.mockResolvedValueOnce({
      insertedIds: [],
      updatedIds: [1],
    });
    fireEvent.click(saveButton);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(bulkUpsertSelectOptions.mock.calls[1][1]).toContainEqual(
      expect.objectContaining({ id: 1, value: "チームA", isNew: false }),
    );
    expect(screen.getByRole("button", { name: "更新" })).toBeDisabled();
  });

  it("削除して保存した項目と同じ名前を追加し、削除済みの行が再び有効になった場合は、その行を 1 行として扱う", async () => {
    bulkUpsertSelectOptions.mockResolvedValueOnce({
      insertedIds: [],
      updatedIds: [1],
    });
    renderWithMantine(
      <SelectOptionList optionClass="team" optionList={optionList} />,
    );

    const removeButton = screen
      .getByDisplayValue("チームA")
      .closest("tr")
      ?.querySelector("button");
    fireEvent.click(removeButton as HTMLButtonElement);
    fireEvent.click(screen.getByRole("button", { name: "更新" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    // The server reactivates the deleted row (id: 1) when the same name is added.
    fireEvent.click(screen.getByRole("button", { name: "チーム追加" }));
    fireEvent.change(screen.getByDisplayValue(""), {
      target: { value: "チームA" },
    });
    bulkUpsertSelectOptions.mockImplementationOnce(
      async (
        _optionClass: string,
        options: { id: number; isNew: boolean }[],
      ) => ({
        insertedIds: [
          { tempId: options.find((option) => option.isNew)!.id, id: 1 },
        ],
        updatedIds: [1],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "更新" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(screen.getAllByDisplayValue("チームA")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "更新" })).toBeDisabled();

    bulkUpsertSelectOptions.mockResolvedValueOnce({
      insertedIds: [],
      updatedIds: [1],
    });
    editOption();
    fireEvent.click(screen.getByRole("button", { name: "更新" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(3));
    expect(bulkUpsertSelectOptions.mock.calls[2][1]).toEqual([
      expect.objectContaining({
        id: 1,
        value: "チームA2",
        is_active: true,
        isNew: false,
      }),
    ]);
  });

  it("変更していない行は送らず、変更した行（名前を変えたかを添える）と追加した行だけを送る", async () => {
    bulkUpsertSelectOptions.mockResolvedValue({
      insertedIds: [],
      updatedIds: [],
    });
    renderWithMantine(
      <SelectOptionList
        optionClass="team"
        optionList={[
          { id: 1, value: "チームA", display_order: 1, is_active: true },
          { id: 2, value: "チームB", display_order: 2, is_active: true },
          { id: 3, value: "チームC", display_order: 3, is_active: true },
        ]}
      />,
    );

    editOption();
    fireEvent.click(
      screen
        .getByDisplayValue("チームC")
        .closest("tr")
        ?.querySelector("button") as HTMLButtonElement,
    );
    fireEvent.click(screen.getByRole("button", { name: "チーム追加" }));
    fireEvent.change(screen.getByDisplayValue(""), {
      target: { value: "チームD" },
    });
    fireEvent.click(screen.getByRole("button", { name: "更新" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    expect(bulkUpsertSelectOptions.mock.calls[0][1]).toEqual([
      expect.objectContaining({
        id: 1,
        value: "チームA2",
        isNew: false,
        valueChanged: true,
      }),
      expect.objectContaining({
        id: 3,
        is_active: false,
        isNew: false,
        valueChanged: false,
      }),
      expect.objectContaining({ value: "チームD", isNew: true }),
    ]);
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

describe("baselineAfterPartialSave", () => {
  const row = (
    id: number,
    value: string,
    overrides: {
      is_active?: boolean;
      isNew?: boolean;
      display_order?: number;
    } = {},
  ) => ({
    id,
    value,
    display_order: Math.abs(id),
    is_active: true,
    isNew: false,
    ...overrides,
  });

  it("保存できた行は送った内容、保存できなかった既存の行は元の内容にし、保存できなかった追加行は含めない（並びは送った順）", () => {
    const baseline = [row(1, "A"), row(2, "B"), row(3, "C")];
    const sentRows = [
      row(2, "B2", { display_order: 1 }),
      row(1, "A2", { display_order: 2 }),
      row(3, "C", { is_active: false }),
      row(-1, "D", { isNew: true }),
      row(-2, "E", { isNew: true }),
      row(-3, "取り消し", { isNew: true, is_active: false }),
    ];

    expect(
      baselineAfterPartialSave(
        baseline,
        sentRows,
        [{ tempId: -1, id: 100 }],
        [2],
      ),
    ).toEqual([
      row(2, "B2", { display_order: 1 }),
      row(1, "A"),
      row(3, "C"),
      row(100, "D", { display_order: 1 }),
    ]);
  });

  it("削除済みの行を再び有効にした追加行は、その行の id の 1 行にする", () => {
    const baseline = [row(5, "広報", { is_active: false })];
    const sentRows = [
      row(5, "広報", { is_active: false }),
      row(-1, "広報", { isNew: true }),
    ];

    expect(
      baselineAfterPartialSave(baseline, sentRows, [{ tempId: -1, id: 5 }], []),
    ).toEqual([row(5, "広報", { display_order: 1 })]);
  });
});

describe("optionRowsToSave", () => {
  const row = (
    id: number,
    value: string,
    overrides: {
      is_active?: boolean;
      isNew?: boolean;
      display_order?: number | null;
    } = {},
  ) => ({
    id,
    value,
    display_order: Math.abs(id) as number | null,
    is_active: true,
    isNew: false,
    ...overrides,
  });

  it("変更の無い行は送らない", () => {
    const baseline = [row(1, "A"), row(2, "B")];
    expect(optionRowsToSave(baseline, [row(1, "A"), row(2, "B")])).toEqual([]);
  });

  it("並べ替えで表示順だけが変わった行・削除した行は valueChanged: false、名前を変えた行は true で送る", () => {
    const baseline = [row(1, "A"), row(2, "B"), row(3, "C"), row(4, "D")];
    const rows = [
      row(2, "B", { display_order: 1 }),
      row(1, "A", { display_order: 2 }),
      row(3, "C2"),
      row(4, "D", { is_active: false }),
    ];

    expect(optionRowsToSave(baseline, rows)).toEqual([
      { ...row(2, "B", { display_order: 1 }), valueChanged: false },
      { ...row(1, "A", { display_order: 2 }), valueChanged: false },
      { ...row(3, "C2"), valueChanged: true },
      { ...row(4, "D", { is_active: false }), valueChanged: false },
    ]);
  });

  it("追加した行は送り、追加してすぐ削除した行は送らない", () => {
    const baseline = [row(1, "A")];
    const rows = [
      row(1, "A"),
      row(-1, "B", { isNew: true, display_order: 2 }),
      row(-2, "取り消し", { isNew: true, is_active: false }),
    ];

    expect(optionRowsToSave(baseline, rows)).toEqual([
      row(-1, "B", { isNew: true, display_order: 2 }),
    ]);
  });

  it("表示順が未設定（null / 0）の行を送る場合は、画面の行数を表示順にする", () => {
    const baseline = [row(1, "A", { display_order: null }), row(2, "B")];
    const rows = [row(1, "A2", { display_order: null }), row(2, "B")];

    expect(optionRowsToSave(baseline, rows)).toEqual([
      { ...row(1, "A2", { display_order: 2 }), valueChanged: true },
    ]);
  });
});
