// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CopyPreviousExtraEntriesButton from "@/app/components/profitLoss/CopyPreviousExtraEntriesButton";
import { ExtraEntryType } from "@/app/types/types";
import { notifyError, notifySuccess } from "@/app/utils/notify";
import { CLOSED_MONTH_LOCK_MESSAGE } from "@/app/utils/profitLossClosing";
import { renderWithMantine } from "../testUtils/renderWithMantine";

// 前月コピーの結果（登録件数・スキップ件数）に応じた通知を、実フックと実 QueryClient で確かめる。
// 同じ月を同時にコピーした後のほう（copy_extra_entries が先のコピーの登録を待ってから確認する）は
// 「登録 0 件・スキップ N 件」になり、全件スキップの案内が出る
const { getPreviousMonthExtraEntries, copyExtraEntriesFromPreviousMonth } =
  vi.hoisted(() => ({
    getPreviousMonthExtraEntries: vi.fn(),
    copyExtraEntriesFromPreviousMonth: vi.fn(),
  }));
vi.mock("@/app/utils/supabase/extraEntries", () => ({
  getPreviousMonthExtraEntries,
  copyExtraEntriesFromPreviousMonth,
  getExtraEntryList: vi.fn(),
  bulkUpsertExtraEntry: vi.fn(),
  getExtraEntrySuggestions: vi.fn(),
}));
vi.mock("@/app/utils/confirmAction", () => ({
  confirmAction: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/app/utils/notify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/utils/notify")>()),
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

const entry = (id: number): ExtraEntryType => ({
  id,
  entry_type: "income",
  category: "協賛金",
  entry_date: "2026-08-10",
  invoice_number: null,
  description: `協賛${id}`,
  billing_target: null,
  manager_id: 1,
  team: null,
  billing_amount: 10000,
  expense_amount: null,
  payment_method: null,
  inserted_at: "",
  updated_at: "",
});

const renderButton = () =>
  renderWithMantine(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: 0 },
          },
        })
      }
    >
      <CopyPreviousExtraEntriesButton
        month="2026-09"
        hasExistingEntries={false}
        isClosed={false}
      />
    </QueryClientProvider>,
  );

const clickCopy = async () => {
  const button = screen.getByRole("button", {
    name: "前月の経理追加収支をコピー",
  });
  // 前月分の取得が終わるとボタンが押せるようになる
  await vi.waitFor(() => expect(button).toHaveProperty("disabled", false));
  fireEvent.click(button);
};

describe("CopyPreviousExtraEntriesButton の件数表示", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    getPreviousMonthExtraEntries.mockResolvedValue({
      extraEntryList: [entry(1), entry(2), entry(3)],
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("全件を登録したら登録件数を通知し、前月分の id と対象月でコピーする", async () => {
    copyExtraEntriesFromPreviousMonth.mockResolvedValue({
      insertedCount: 3,
      skippedCount: 0,
      error: null,
    });
    renderButton();
    await clickCopy();

    await vi.waitFor(() =>
      expect(notifySuccess).toHaveBeenCalledWith(
        "3件の経理追加収支をコピーしました。",
      ),
    );
    expect(copyExtraEntriesFromPreviousMonth).toHaveBeenCalledWith(
      [1, 2, 3],
      "2026-09",
    );
  });

  it("一部をスキップしたら登録件数とスキップ件数を通知する", async () => {
    copyExtraEntriesFromPreviousMonth.mockResolvedValue({
      insertedCount: 2,
      skippedCount: 1,
      error: null,
    });
    renderButton();
    await clickCopy();

    await vi.waitFor(() =>
      expect(notifySuccess).toHaveBeenCalledWith(
        "2件の経理追加収支をコピーしました（1件は当月に同一内容が既にあるためスキップしました）。",
      ),
    );
  });

  it("同時に走った他のコピーが先に登録していた（登録 0 件・全件スキップ）ら、スキップしたことを通知する", async () => {
    copyExtraEntriesFromPreviousMonth.mockResolvedValue({
      insertedCount: 0,
      skippedCount: 3,
      error: null,
    });
    renderButton();
    await clickCopy();

    await vi.waitFor(() =>
      expect(notifySuccess).toHaveBeenCalledWith(
        "当月に同一内容の経理追加収支が既に登録されているため、コピーをスキップしました。",
      ),
    );
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("コピーの途中で対象月が確定されたら、確定済みのエラーを通知する", async () => {
    copyExtraEntriesFromPreviousMonth.mockResolvedValue({
      insertedCount: 0,
      skippedCount: 0,
      error: null,
      closedMonthError: CLOSED_MONTH_LOCK_MESSAGE,
    });
    renderButton();
    await clickCopy();

    await vi.waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(CLOSED_MONTH_LOCK_MESSAGE),
    );
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});
