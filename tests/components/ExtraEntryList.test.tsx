// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExtraEntryList from "@/app/components/extraEntries/ExtraEntryList";
import { ExtraEntryType } from "@/app/types/types";
import type { ExtraEntrySuggestion } from "@/app/hooks/useExtraEntryData";
import { notifyError, notifySuccess } from "@/app/utils/notify";
import { confirmAction } from "@/app/utils/confirmAction";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const mutateAsync = vi.fn();
// Let tests override parts of the mock return value (fetch failure, closed months loading, etc.).
const extraEntryListOverrides = vi.hoisted(() => ({
  value: {} as {
    data?: ExtraEntryType[] | null;
    isLoading?: boolean;
    isError?: boolean;
    isPlaceholderData?: boolean;
    isFetching?: boolean;
    isStale?: boolean;
    dataUpdatedAt?: number;
    isPaused?: boolean;
    isInvalidated?: boolean;
  },
}));
const refetch = vi.fn();
const closedMonthsOverrides = vi.hoisted(() => ({
  value: {} as {
    closedMonths?: Set<string>;
    isLoading?: boolean;
    isError?: boolean;
  },
}));
const suggestionsState = vi.hoisted(() => ({
  value: [] as ExtraEntrySuggestion[],
}));
vi.mock("@/app/hooks/useExtraEntryData", () => ({
  useExtraEntryList: (
    _month: string,
    initialData?: ExtraEntryType[] | null,
    _initialDataUpdatedAt?: number,
  ) => ({
    data: initialData,
    isLoading: false,
    isError: false,
    isPlaceholderData: false,
    isFetching: false,
    isStale: false,
    isPaused: false,
    isInvalidated: false,
    dataUpdatedAt: 1,
    refetch,
    ...extraEntryListOverrides.value,
  }),
  useExtraEntrySuggestions: () => ({ data: suggestionsState.value }),
  useUpsertExtraEntry: () => ({ mutateAsync, isPending: false }),
  ExtraEntryValidationError: class extends Error {},
}));
vi.mock("@/app/hooks/useClosedMonths", () => ({
  useClosedMonths: () => ({
    closedMonths: new Set(["2026-08"]),
    isLoading: false,
    isError: false,
    ...closedMonthsOverrides.value,
  }),
}));
vi.mock("@/app/utils/confirmAction", () => ({
  confirmAction: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/app/utils/notify", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));
// Replace the month picker with a plain input so fireEvent can change months.
vi.mock("@/app/components/CustomMonthPicker", () => ({
  CustomMonthPicker: ({
    value,
    onChange,
  }: {
    value: string | null;
    onChange: (month: string | null) => void;
  }) => (
    <input
      aria-label="対象月"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
    />
  ),
}));
// Replace the date picker with a plain input so the default date of a new row can be asserted.
vi.mock("@/app/components/CustomDatePicker", () => ({
  CustomDatePicker: ({
    value,
    onChange,
    placeholder,
    disabled,
  }: {
    value: string | null;
    onChange: (date: string | null) => void;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <input
      placeholder={placeholder}
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
    />
  ),
}));

const entry = (overrides: Partial<ExtraEntryType>): ExtraEntryType => ({
  id: 1,
  entry_type: "income",
  category: "協賛金",
  entry_date: "2026-09-10",
  invoice_number: null,
  description: "協賛",
  billing_target: null,
  manager_id: 1,
  team: null,
  billing_amount: 10000,
  expense_amount: null,
  payment_method: null,
  inserted_at: "",
  updated_at: "",
  ...overrides,
});

const listElement = (
  initialData: ExtraEntryType[],
  initialMonth = "2026-09",
) => (
  <ExtraEntryList
    initialMonth={initialMonth}
    initialData={initialData}
    initialDataUpdatedAt={Date.now()}
    incomeCategoryList={["協賛金"]}
    expenseCategoryList={["交通費"]}
    paymentMethodList={["現金"]}
    teamList={["シンラボ"]}
    initialSuggestions={[]}
    memberList={[{ value: "1", label: "経理太郎" }]}
  />
);

const renderList = (initialData: ExtraEntryType[], initialMonth = "2026-09") =>
  renderWithMantine(listElement(initialData, initialMonth));

const resetMocks = () => {
  // The real hook invalidates the list on save success (onSuccess).
  mutateAsync.mockReset().mockImplementation(async () => {
    extraEntryListOverrides.value = {
      ...extraEntryListOverrides.value,
      isInvalidated: true,
    };
  });
  refetch.mockReset();
  vi.mocked(notifyError).mockReset();
  vi.mocked(notifySuccess).mockReset();
  vi.mocked(confirmAction).mockReset();
  vi.mocked(confirmAction).mockResolvedValue(true);
  extraEntryListOverrides.value = {};
  closedMonthsOverrides.value = {};
  suggestionsState.value = [];
};

describe("ExtraEntryList の一括保存", () => {
  beforeEach(resetMocks);

  it("編集した行だけを送り、必須チェックも送る行に限る（確定済みの月でロックされた既存行の値で保存が止まらない）", async () => {
    renderList([
      // Closed-month row (not editable in the UI), saved with empty content.
      entry({ id: 1, entry_date: "2026-08-10", description: "" }),
      entry({ id: 2, description: "9月協賛" }),
    ]);
    fireEvent.change(screen.getByDisplayValue("9月協賛"), {
      target: { value: "9月協賛（修正）" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(notifyError).not.toHaveBeenCalled();
    const sent = mutateAsync.mock.calls[0][0];
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ id: 2, description: "9月協賛（修正）" });
  });

  it("編集した行の必須項目が空なら保存しない", async () => {
    renderList([entry({ id: 2, description: "9月協賛" })]);
    fireEvent.change(screen.getByDisplayValue("9月協賛"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await vi.waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(
        "内容は必須です。未入力の欄があります。",
      ),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

describe("ExtraEntryList の月別表示（Issue #157）", () => {
  beforeEach(resetMocks);

  it("月未確定（日付未入力）の行には「月未確定」バッジを付ける", () => {
    renderList([entry({ id: 2, entry_date: null, description: "9月協賛" })]);

    expect(screen.getByText("月未確定")).toBeTruthy();
  });

  it("追加した行の日付の初期値は対象月の1日", () => {
    renderList([entry({ id: 2, description: "9月協賛" })]);
    fireEvent.click(screen.getByRole("button", { name: "収入を追加" }));

    expect(screen.getByDisplayValue("2026-09-01")).toBeTruthy();
  });

  it("確定済みの月では追加ボタンが無効になる", () => {
    renderList([entry({ id: 1, entry_date: "2026-08-10" })], "2026-08");

    expect(screen.getByRole("button", { name: "収入を追加" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "支出を追加" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("未保存の編集がある状態で月を変えると確認が出て、キャンセルで編集内容が保持される", async () => {
    renderList([entry({ id: 2, description: "9月協賛" })]);
    fireEvent.change(screen.getByDisplayValue("9月協賛"), {
      target: { value: "9月協賛（編集中）" },
    });

    vi.mocked(confirmAction).mockResolvedValueOnce(false);
    fireEvent.change(screen.getByLabelText("対象月"), {
      target: { value: "2026-10" },
    });
    await vi.waitFor(() =>
      expect(confirmAction).toHaveBeenCalledWith(
        "未保存の変更があります。破棄して対象月を切り替えますか？",
      ),
    );
    expect((screen.getByLabelText("対象月") as HTMLInputElement).value).toBe(
      "2026-09",
    );
    expect(screen.getByDisplayValue("9月協賛（編集中）")).toBeTruthy();

    vi.mocked(confirmAction).mockResolvedValueOnce(true);
    fireEvent.change(screen.getByLabelText("対象月"), {
      target: { value: "2026-10" },
    });
    await vi.waitFor(() =>
      expect((screen.getByLabelText("対象月") as HTMLInputElement).value).toBe(
        "2026-10",
      ),
    );
  });

  it("確定済みの月の情報を取得中は、確定済みでない月でも追加ボタンが無効になる", () => {
    closedMonthsOverrides.value = {
      closedMonths: new Set<string>(),
      isLoading: true,
    };
    renderList([entry({ id: 2, description: "9月協賛" })], "2026-09");

    expect(screen.getByRole("button", { name: "収入を追加" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "支出を追加" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("キャッシュ済みのstaleな月への切替中（再取得中）は保存できない", () => {
    extraEntryListOverrides.value = { isFetching: true, isStale: true };
    renderList([entry({ id: 2, description: "9月協賛" })]);

    expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("他の月の過去入力も内容の候補に出る", async () => {
    suggestionsState.value = [
      { description: "先月の定例収入", billing_target: "先月の請求先" },
    ];
    renderList([entry({ id: 2, description: "9月協賛" })]);
    fireEvent.change(screen.getByDisplayValue("9月協賛"), {
      target: { value: "先月" },
    });

    expect(await screen.findByText("先月の定例収入")).toBeTruthy();
  });
});

describe("ExtraEntryList の取得失敗時の表示（レビュー指摘）", () => {
  beforeEach(resetMocks);

  it("再取得の失敗時もデータがあればフォームを残し、警告と保存ボタンを表示する", () => {
    extraEntryListOverrides.value = { isError: true };
    renderList([entry({ id: 2, description: "9月協賛" })]);

    expect(
      screen.getByText("最新の経理追加収支情報の取得に失敗しました"),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("9月協賛")).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存" })).toBeTruthy();
  });

  it("データが無い状態での取得失敗は画面全体の Alert になる", () => {
    extraEntryListOverrides.value = { data: undefined, isError: true };
    renderList([]);

    expect(
      screen.getByText("経理追加収支情報の取得に失敗しました"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
  });
});

// Repeated save/re-render; stay clear of the default 5s timeout on slow machines.
describe(
  "ExtraEntryList の保存後の再取得（Issue #170）",
  { timeout: 15000 },
  () => {
    beforeEach(resetMocks);

    // Advance list state: save -> refetching -> refetch fails. data stays the pre-save cache
    // (invalidation is not cleared).
    const saveThenFailRefetch = async (initialData: ExtraEntryType[]) => {
      const view = renderList(initialData);
      fireEvent.change(screen.getByDisplayValue("9月協賛"), {
        target: { value: "9月協賛（修正）" },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalled());

      extraEntryListOverrides.value = {
        isFetching: true,
        isStale: true,
        isInvalidated: true,
      };
      view.rerender(listElement(initialData));
      extraEntryListOverrides.value = { isError: true, isInvalidated: true };
      view.rerender(listElement(initialData));
      return view;
    };

    it("再取得が失敗しても保存した内容を保存前のキャッシュで上書きせず、再読み込みを促して編集・保存を止める", async () => {
      await saveThenFailRefetch([entry({ id: 2, description: "9月協賛" })]);

      expect(screen.getByDisplayValue("9月協賛（修正）")).toBeTruthy();
      expect(screen.queryByDisplayValue("9月協賛")).toBeNull();
      expect(
        screen.getByText(
          "保存は完了しましたが、最新の経理追加収支情報を取得できませんでした",
        ),
      ).toBeTruthy();
      // Resending saved rows would double-register, so save/add/edit are disabled.
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
        "disabled",
        true,
      );
      expect(screen.getByRole("button", { name: "収入を追加" })).toHaveProperty(
        "disabled",
        true,
      );
      expect(screen.getByDisplayValue("9月協賛（修正）")).toHaveProperty(
        "disabled",
        true,
      );
    });

    it("「再読み込み」で一覧を取り直し、新しい一覧が届いたら同期して編集を再開できる", async () => {
      const initialData = [entry({ id: 2, description: "9月協賛" })];
      const view = await saveThenFailRefetch(initialData);

      fireEvent.click(screen.getByRole("button", { name: "再読み込み" }));
      expect(refetch).toHaveBeenCalledTimes(1);

      extraEntryListOverrides.value = {
        data: [
          entry({ id: 2, description: "9月協賛（修正）" }),
          entry({ id: 5, description: "他の利用者が追加" }),
        ],
        dataUpdatedAt: 2,
      };
      view.rerender(listElement(initialData));

      expect(screen.getByDisplayValue("他の利用者が追加")).toBeTruthy();
      expect(
        screen.queryByText(
          "保存は完了しましたが、最新の経理追加収支情報を取得できませんでした",
        ),
      ).toBeNull();
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
        "disabled",
        false,
      );
    });

    it("保存後の再取得が成功したら、そのまま新しい一覧に同期する", async () => {
      const initialData = [entry({ id: 2, description: "9月協賛" })];
      const view = renderList(initialData);
      fireEvent.change(screen.getByDisplayValue("9月協賛"), {
        target: { value: "9月協賛（修正）" },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalled());

      extraEntryListOverrides.value = {
        data: [entry({ id: 2, description: "9月協賛（サーバ側の値）" })],
        dataUpdatedAt: 2,
      };
      view.rerender(listElement(initialData));

      expect(screen.getByDisplayValue("9月協賛（サーバ側の値）")).toBeTruthy();
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
        "disabled",
        false,
      );
    });

    it("保存が拒否された（何も書き込まれていない）ときは再取得待ちにせず、編集内容を残したまま再度保存できる", async () => {
      const { ExtraEntryValidationError } =
        await import("@/app/hooks/useExtraEntryData");
      mutateAsync.mockRejectedValueOnce(
        new ExtraEntryValidationError("確定済みの月のため保存できません"),
      );
      renderList([entry({ id: 2, description: "9月協賛" })]);
      fireEvent.change(screen.getByDisplayValue("9月協賛"), {
        target: { value: "9月協賛（修正）" },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await vi.waitFor(() =>
        expect(notifyError).toHaveBeenCalledWith(
          "確定済みの月のため保存できません",
        ),
      );

      expect(screen.getByDisplayValue("9月協賛（修正）")).toBeTruthy();
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
        "disabled",
        false,
      );
    });

    it("無効化された一覧は、再取得中も取り直せるまで編集・保存を止める（定期費用と同じロック条件。Issue #190）", () => {
      extraEntryListOverrides.value = { isInvalidated: true, isFetching: true };
      renderList([entry({ id: 2, description: "9月協賛" })]);

      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
        "disabled",
        true,
      );
      expect(screen.getByRole("button", { name: "収入を追加" })).toHaveProperty(
        "disabled",
        true,
      );
      expect(screen.queryByText("再読み込み")).toBeNull();
    });

    it("通信の失敗などで保存できたか分からないときは、一覧を取り直すまで編集・保存を止める（押し直しによる二重登録を防ぐ）", async () => {
      // The real hook invalidates the list when a failure leaves the save outcome unknown (network error).
      mutateAsync.mockImplementationOnce(async () => {
        extraEntryListOverrides.value = { isInvalidated: true };
        throw new TypeError("Failed to fetch");
      });
      const initialData = [entry({ id: 2, description: "9月協賛" })];
      const view = renderList(initialData);
      fireEvent.change(screen.getByDisplayValue("9月協賛"), {
        target: { value: "9月協賛（修正）" },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await vi.waitFor(() => expect(notifyError).toHaveBeenCalled());

      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
        "disabled",
        true,
      );
      expect(screen.getByRole("button", { name: "収入を追加" })).toHaveProperty(
        "disabled",
        true,
      );

      extraEntryListOverrides.value = { isError: true, isInvalidated: true };
      view.rerender(listElement(initialData));
      expect(
        screen.getByText(
          "保存できたか確認できず、最新の経理追加収支情報も取得できませんでした",
        ),
      ).toBeTruthy();

      extraEntryListOverrides.value = {
        data: [entry({ id: 2, description: "9月協賛（修正）" })],
        dataUpdatedAt: 2,
      };
      view.rerender(listElement(initialData));
      expect(screen.getByDisplayValue("9月協賛（修正）")).toBeTruthy();
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
        "disabled",
        false,
      );
    });

    it("無効化された一覧を取り直せないまま表示している（月の往復・開き直し）ときは、古い一覧での編集・保存を止める", () => {
      extraEntryListOverrides.value = { isInvalidated: true, isError: true };
      renderList([entry({ id: 2, description: "9月協賛" })]);

      expect(
        screen.getByText("最新の経理追加収支情報を取得できませんでした"),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
        "disabled",
        true,
      );
      expect(screen.getByRole("button", { name: "収入を追加" })).toHaveProperty(
        "disabled",
        true,
      );
    });

    it("オフラインで再取得が止まっている（paused）間も、無効化された一覧では編集を止めて案内を出す", () => {
      extraEntryListOverrides.value = { isInvalidated: true, isPaused: true };
      renderList([entry({ id: 2, description: "9月協賛" })]);

      expect(
        screen.getByText("最新の経理追加収支情報を取得できませんでした"),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
        "disabled",
        true,
      );
    });

    it("以前の取得エラーが残っていても、再取得中は「取得できませんでした」を出さない", () => {
      extraEntryListOverrides.value = {
        isInvalidated: true,
        isError: true,
        isFetching: true,
        isStale: true,
      };
      renderList([entry({ id: 2, description: "9月協賛" })]);

      expect(
        screen.queryByText("最新の経理追加収支情報を取得できませんでした"),
      ).toBeNull();
      expect(
        screen.queryByText("最新の経理追加収支情報の取得に失敗しました"),
      ).toBeNull();
    });

    it("staleTime の経過による再取得の失敗（無効化されていない）では、従来どおり編集・保存できる", () => {
      extraEntryListOverrides.value = { isError: true, isStale: true };
      renderList([entry({ id: 2, description: "9月協賛" })]);

      expect(
        screen.getByText("最新の経理追加収支情報の取得に失敗しました"),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
        "disabled",
        false,
      );
    });
  },
);
