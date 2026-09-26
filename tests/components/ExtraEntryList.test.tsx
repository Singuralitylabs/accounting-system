// @vitest-environment jsdom

import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExtraEntryList from "@/app/components/extraEntries/ExtraEntryList";
import { ExtraEntryType } from "@/app/types/types";
import { notifyError } from "@/app/utils/notify";
import { renderWithMantine } from "../testUtils/renderWithMantine";

const mutateAsync = vi.fn();
vi.mock("@/app/hooks/useExtraEntryData", () => ({
  useExtraEntryList: (initialData: ExtraEntryType[]) => ({
    data: initialData,
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

const renderList = (initialData: ExtraEntryType[]) =>
  renderWithMantine(
    <ExtraEntryList
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
