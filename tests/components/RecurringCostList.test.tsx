// @vitest-environment jsdom

import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecurringCostList from "@/app/components/recurringCosts/RecurringCostList";
import { RecurringCostType } from "@/app/types/types";
import { notifyError, notifySuccess } from "@/app/utils/notify";
import { renderWithMantine } from "../testUtils/renderWithMantine";

// 定期費用の保存は追加・更新・削除を並列に送るため、失敗しても一部だけ反映されている
// （または応答だけ失われて反映済みの）可能性がある。そのまま押し直すと新規行が二重に
// 登録されうるため、一覧を取り直すまで編集・保存を止めることを実 QueryClient で確かめる
const { getRecurringCostList, bulkUpsertRecurringCost } = vi.hoisted(() => ({
  getRecurringCostList: vi.fn(),
  bulkUpsertRecurringCost: vi.fn(),
}));
vi.mock("@/app/utils/supabase/recurringCosts", () => ({
  getRecurringCostList,
  bulkUpsertRecurringCost,
}));
vi.mock("@/app/hooks/useClosedMonths", () => ({
  useClosedMonths: () => ({
    closedMonths: new Set<string>(),
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/app/utils/confirmAction", () => ({
  confirmAction: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/app/utils/notify", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));
vi.mock("@/app/components/CustomMonthPicker", () => ({
  CustomMonthPicker: ({
    value,
    disabled,
    placeholder,
  }: {
    value: string | null;
    disabled?: boolean;
    placeholder?: string;
  }) => (
    <input
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      readOnly
    />
  ),
}));

const cost = (overrides: Partial<RecurringCostType>): RecurringCostType => ({
  id: 1,
  name: "サーバ代",
  item: "通信費",
  price: 10000,
  team: null,
  payment_cycle: "monthly",
  start_month: "2026-04-01",
  end_month: null,
  comment: null,
  inserted_at: "",
  updated_at: "",
  ...overrides,
});

const renderList = (initialData: RecurringCostType[]) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: 2, retryDelay: 0, refetchOnMount: false },
      mutations: { retry: 0 },
    },
  });
  return renderWithMantine(
    <QueryClientProvider client={queryClient}>
      <RecurringCostList
        initialData={initialData}
        itemList={["通信費"]}
        teamList={["シンラボ"]}
      />
    </QueryClientProvider>,
  );
};

const editAndSave = async () => {
  fireEvent.change(screen.getByDisplayValue("サーバ代"), {
    target: { value: "サーバ代（改定）" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await vi.waitFor(() => expect(notifyError).toHaveBeenCalled());
};

describe("RecurringCostList の保存失敗後の扱い", { timeout: 15000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    bulkUpsertRecurringCost.mockRejectedValue(
      new Error("定期費用情報の更新に失敗しました"),
    );
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    vi.restoreAllMocks();
  });

  it("取り直しにも失敗したら、保存結果が分からない旨を出して編集・保存を止める", async () => {
    getRecurringCostList.mockResolvedValue({
      recurringCostList: null,
      error: { message: "network" },
    });
    renderList([cost({ id: 1 })]);

    await editAndSave();

    expect(
      await screen.findByText(
        "保存結果を確認できず、最新の定期費用情報も取得できませんでした",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "定期費用追加" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByDisplayValue("サーバ代（改定）")).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("取り直せたら実際の状態に同期し、編集を再開できる", async () => {
    getRecurringCostList.mockResolvedValue({
      recurringCostList: [cost({ id: 1, name: "サーバ代（改定）" })],
      error: null,
    });
    renderList([cost({ id: 1 })]);

    await editAndSave();

    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
        "disabled",
        false,
      ),
    );
    expect(getRecurringCostList).toHaveBeenCalled();
    expect(screen.getByDisplayValue("サーバ代（改定）")).toBeTruthy();
  });

  it("オフラインで取り直しが一時停止しても、理由と「再読み込み」を表示する", async () => {
    getRecurringCostList.mockResolvedValue({
      recurringCostList: [cost({ id: 1 })],
      error: null,
    });
    renderList([cost({ id: 1 })]);
    // 保存の失敗と同時に通信が切れた状態にする（再取得は paused になる）
    bulkUpsertRecurringCost.mockImplementation(async () => {
      onlineManager.setOnline(false);
      throw new Error("定期費用情報の更新に失敗しました");
    });

    await editAndSave();

    expect(
      await screen.findByText(
        "保存結果を確認できず、最新の定期費用情報も取得できませんでした",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/通信が回復すると自動で取得します/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});

describe(
  "RecurringCostList の保存成功後の扱い（Issue #170 と同じ経路）",
  { timeout: 15000 },
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.spyOn(console, "error").mockImplementation(() => {});
      bulkUpsertRecurringCost.mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("保存後の取り直しに失敗しても、保存前の一覧で上書きせず編集・保存を止める", async () => {
      getRecurringCostList.mockResolvedValue({
        recurringCostList: null,
        error: { message: "network" },
      });
      renderList([cost({ id: 1 })]);

      fireEvent.change(screen.getByDisplayValue("サーバ代"), {
        target: { value: "サーバ代（改定）" },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalled());

      expect(
        await screen.findByText(
          "保存は完了しましたが、最新の定期費用情報を取得できませんでした",
        ),
      ).toBeTruthy();
      // 保存した内容を表示したまま（保存前の「サーバ代」に戻らない）
      expect(screen.getByDisplayValue("サーバ代（改定）")).toBeTruthy();
      expect(screen.queryByDisplayValue("サーバ代")).toBeNull();
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
        "disabled",
        true,
      );
      expect(
        screen.getByRole("button", { name: "定期費用追加" }),
      ).toHaveProperty("disabled", true);
    });

    it("保存後に取り直せたら、取り直した一覧に同期して編集を再開できる", async () => {
      getRecurringCostList.mockResolvedValue({
        recurringCostList: [
          cost({ id: 1, name: "サーバ代（改定）" }),
          cost({ id: 2, name: "他の利用者が追加" }),
        ],
        error: null,
      });
      renderList([cost({ id: 1 })]);

      fireEvent.change(screen.getByDisplayValue("サーバ代"), {
        target: { value: "サーバ代（改定）" },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));

      expect(await screen.findByDisplayValue("他の利用者が追加")).toBeTruthy();
      await vi.waitFor(() =>
        expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
          "disabled",
          false,
        ),
      );
    });
  },
);
