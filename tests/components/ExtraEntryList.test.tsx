// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExtraEntryList from "@/app/components/extraEntries/ExtraEntryList";
import { ExtraEntryType } from "@/app/types/types";
import { notifyError } from "@/app/utils/notify";
import { confirmAction } from "@/app/utils/confirmAction";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const mutateAsync = vi.fn();
vi.mock("@/app/hooks/useExtraEntryData", () => ({
  useExtraEntryList: (
    _month: string,
    initialData?: ExtraEntryType[] | null,
  ) => ({
    data: initialData,
    isLoading: false,
    isError: false,
    isPlaceholderData: false,
  }),
  useUpsertExtraEntry: () => ({ mutateAsync, isPending: false }),
  ExtraEntryValidationError: class extends Error {},
}));
vi.mock("@/app/hooks/useClosedMonths", () => ({
  useClosedMonths: () => ({ closedMonths: new Set(["2026-08"]) }),
}));
vi.mock("@/app/utils/confirmAction", () => ({
  confirmAction: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/app/utils/notify", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));
// 月切替の操作を fireEvent で行えるよう、月ピッカーは素朴な input に置き換える
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
// 新規行の日付初期値を表示値で検証できるよう、日付ピッカーも素朴な input に置き換える
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

const renderList = (initialData: ExtraEntryType[], initialMonth = "2026-09") =>
  renderWithMantine(
    <ExtraEntryList
      initialMonth={initialMonth}
      initialData={initialData}
      incomeCategoryList={["協賛金"]}
      expenseCategoryList={["交通費"]}
      paymentMethodList={["現金"]}
      teamList={["シンラボ"]}
      memberList={[{ value: "1", label: "経理太郎" }]}
    />,
  );

describe("ExtraEntryList の一括保存", () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue(undefined);
    vi.mocked(notifyError).mockReset();
    vi.mocked(confirmAction).mockReset();
    vi.mocked(confirmAction).mockResolvedValue(true);
  });

  it("編集した行だけを送り、必須チェックも送る行に限る（確定済みの月でロックされた既存行の値で保存が止まらない）", async () => {
    renderList([
      // 確定済みの月の行（画面では編集できない）。内容が空のまま保存されている
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
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue(undefined);
    vi.mocked(notifyError).mockReset();
    vi.mocked(confirmAction).mockReset();
    vi.mocked(confirmAction).mockResolvedValue(true);
  });

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

    // キャンセルしたら月が変わらず編集内容が残る
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

    // 確認したら対象月が切り替わる
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
});
