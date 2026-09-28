// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExtraEntryList from "@/app/components/extraEntries/ExtraEntryList";
import { ExtraEntryType } from "@/app/types/types";
import { notifySuccess } from "@/app/utils/notify";
import { renderWithMantine } from "../testUtils/renderWithMantine";

// 保存後の再取得の失敗（Issue #170）を、フックをモックせず実 QueryClient と実フックで確かめる。
// 「取得に失敗しても dataUpdatedAt・isInvalidated は変わらない」「保存の onSuccess で
// 一覧が無効化され再取得される」といった TanStack Query の挙動に依存するため
const { getExtraEntryList, bulkUpsertExtraEntry } = vi.hoisted(() => ({
  getExtraEntryList: vi.fn(),
  bulkUpsertExtraEntry: vi.fn(),
}));
vi.mock("@/app/utils/supabase/extraEntries", () => ({
  getExtraEntryList,
  bulkUpsertExtraEntry,
  getExtraEntrySuggestions: vi.fn().mockResolvedValue({ suggestionList: [] }),
  getPreviousMonthExtraEntries: vi.fn(),
  copyExtraEntriesFromPreviousMonth: vi.fn(),
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
vi.mock("@/app/components/CustomDatePicker", () => ({
  CustomDatePicker: ({
    value,
    disabled,
  }: {
    value: string | null;
    disabled?: boolean;
  }) => <input value={value ?? ""} disabled={disabled} readOnly />,
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

const FAILED_TITLE_AFTER_SAVE =
  "保存は完了しましたが、最新の経理追加収支情報を取得できませんでした";
const FAILED_TITLE = "最新の経理追加収支情報を取得できませんでした";

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      // QueryProvider と同じくリトライありにする（待ち時間は 0）
      queries: { retry: 2, retryDelay: 0, refetchOnMount: false },
      mutations: { retry: 1, retryDelay: 0 },
    },
  });

const renderList = (
  initialData: ExtraEntryType[],
  queryClient: QueryClient = createQueryClient(),
) => {
  return renderWithMantine(
    <QueryClientProvider client={queryClient}>
      <ExtraEntryList
        initialMonth="2026-09"
        initialData={initialData}
        initialDataUpdatedAt={Date.now()}
        incomeCategoryList={["協賛金"]}
        expenseCategoryList={["交通費"]}
        paymentMethodList={["現金"]}
        teamList={["シンラボ"]}
        initialSuggestions={[]}
        memberList={[{ value: "1", label: "経理太郎" }]}
      />
    </QueryClientProvider>,
  );
};

const editAndSave = async () => {
  fireEvent.change(screen.getByDisplayValue("9月協賛"), {
    target: { value: "9月協賛（修正）" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalled());
};

// リトライ込みの取得・月の往復を含むため、負荷の高い環境でも既定の 5 秒に掛からないようにする
describe(
  "ExtraEntryList の保存後の再取得（実 QueryClient。Issue #170）",
  { timeout: 15000 },
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.spyOn(console, "error").mockImplementation(() => {});
      bulkUpsertExtraEntry.mockResolvedValue({});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("再取得がリトライ込みで失敗しても、保存した内容を表示したまま編集・保存を止める", async () => {
      getExtraEntryList.mockResolvedValue({
        extraEntryList: null,
        error: { message: "network" },
      });
      renderList([entry({ id: 2, description: "9月協賛" })]);

      await editAndSave();

      expect(await screen.findByText(FAILED_TITLE_AFTER_SAVE)).toBeTruthy();
      // 初回 + リトライ 2 回
      expect(getExtraEntryList).toHaveBeenCalledTimes(3);
      expect(screen.getByDisplayValue("9月協賛（修正）")).toBeTruthy();
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
        "disabled",
        true,
      );
    });

    it("別の月に切り替えて戻っても再取得に失敗したままなら、古い一覧での編集・保存を止める", async () => {
      getExtraEntryList.mockImplementation(async (month: string) =>
        month === "2026-10"
          ? {
              extraEntryList: [
                entry({
                  id: 7,
                  entry_date: "2026-10-05",
                  description: "10月協賛",
                }),
              ],
              error: null,
            }
          : { extraEntryList: null, error: { message: "network" } },
      );
      renderList([entry({ id: 2, description: "9月協賛" })]);

      await editAndSave();
      await screen.findByText(FAILED_TITLE_AFTER_SAVE);

      fireEvent.change(screen.getByLabelText("対象月"), {
        target: { value: "2026-10" },
      });
      expect(await screen.findByDisplayValue("10月協賛")).toBeTruthy();
      fireEvent.change(screen.getByLabelText("対象月"), {
        target: { value: "2026-09" },
      });

      // 戻った先は保存前のキャッシュしか無い。古い一覧だと分かる案内を出し、
      // 保存・追加はできない（保存した行を見失って追加し直す二重登録を防ぐ）
      expect(await screen.findByText(FAILED_TITLE)).toBeTruthy();
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
        "disabled",
        true,
      );
      expect(screen.getByRole("button", { name: "収入を追加" })).toHaveProperty(
        "disabled",
        true,
      );
    });

    it("「再読み込み」で取り直せたら新しい一覧に同期し、編集を再開できる", async () => {
      getExtraEntryList.mockResolvedValue({
        extraEntryList: null,
        error: { message: "network" },
      });
      renderList([entry({ id: 2, description: "9月協賛" })]);

      await editAndSave();
      await screen.findByText(FAILED_TITLE_AFTER_SAVE);

      getExtraEntryList.mockResolvedValue({
        extraEntryList: [
          entry({ id: 2, description: "9月協賛（修正）" }),
          entry({ id: 8, description: "保存で追加した行" }),
        ],
        error: null,
      });
      fireEvent.click(screen.getByRole("button", { name: "再読み込み" }));

      expect(await screen.findByDisplayValue("保存で追加した行")).toBeTruthy();
      expect(screen.queryByText(FAILED_TITLE_AFTER_SAVE)).toBeNull();
      expect(screen.getByRole("button", { name: "保存" })).toHaveProperty(
        "disabled",
        false,
      );
    });

    it("画面を離れている間に無効化された一覧は、開き直したときに取り直す（QueryProvider の既定は refetchOnMount: false）", async () => {
      const queryClient = createQueryClient();
      const view = renderList(
        [entry({ id: 2, description: "9月協賛" })],
        queryClient,
      );
      view.unmount();

      // 損益計算書での前月コピー・確定などで、一覧が非表示の間に無効化される
      await queryClient.invalidateQueries({ queryKey: ["extraEntries"] });
      getExtraEntryList.mockResolvedValue({
        extraEntryList: [
          entry({ id: 2, description: "9月協賛" }),
          entry({ id: 9, description: "前月コピーで追加" }),
        ],
        error: null,
      });
      renderList([entry({ id: 2, description: "9月協賛" })], queryClient);

      expect(await screen.findByDisplayValue("前月コピーで追加")).toBeTruthy();
      expect(getExtraEntryList).toHaveBeenCalledTimes(1);
    });
  },
);
