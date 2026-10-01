// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyError } from "@/app/utils/notify";

const { bulkSaveBudgetRecurringItems } = vi.hoisted(() => ({
  bulkSaveBudgetRecurringItems: vi.fn(),
}));

vi.mock("@/app/utils/supabase/budgetRecurringItems", () => ({
  bulkSaveBudgetRecurringItems,
  getBudgetRecurringItemList: vi.fn(),
  getActiveBudgetRecurringItems: vi.fn(),
}));

vi.mock("@/app/utils/notify", () =>
  import("@/tests/testUtils/mockNotify").then((m) => m.mockNotify()),
);

import { useSaveBudgetRecurringItems } from "@/app/hooks/useBudgetRecurringItemData";

describe("useSaveBudgetRecurringItems の保存失敗", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("書き込み前の失敗では一覧を再取得しない", async () => {
    bulkSaveBudgetRecurringItems.mockResolvedValue({
      error: {
        kind: "validationFailed",
        message:
          "選択された担当者が見つかりません。画面を再読み込みして選び直してください。",
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSaveBudgetRecurringItems(), {
      wrapper,
    });

    await result.current.mutateAsync([]).catch((error) => error);

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalledWith(
      "選択された担当者が見つかりません。画面を再読み込みして選び直してください。",
    );
  });

  it("一部だけ反映された可能性がある失敗では一覧を再取得し、入力し直しを案内する", async () => {
    bulkSaveBudgetRecurringItems.mockResolvedValue({
      error: {
        kind: "partialWriteFailed",
        message: "定期明細の更新に失敗しました。",
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSaveBudgetRecurringItems(), {
      wrapper,
    });

    await result.current.mutateAsync([]).catch((error) => error);

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budgetRecurringItems"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budgetDeclarations", "activeRecurringItems"],
    });
    expect(notifyError).toHaveBeenCalledWith(
      "定期明細の更新に失敗しました。\n一部のみ反映されている可能性があるため、最新の内容を取得して表示します。反映されていない変更は入力し直してください。",
    );
  });
});
