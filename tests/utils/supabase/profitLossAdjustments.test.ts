import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, getAuthorizedViewer } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  getAuthorizedViewer: vi.fn(),
}));

vi.mock("@/app/utils/supabase/clients", () => ({ createServerSupabase }));
vi.mock("@/app/utils/supabase/viewerAccess", () => ({ getAuthorizedViewer }));

import {
  deleteProfitLossAdjustment,
  saveProfitLossAdjustment,
} from "@/app/utils/supabase/profitLossAdjustments";

const CLOSED_MESSAGE = "確定済みの月です";

describe("saveProfitLossAdjustment の確定済みの月（Issue #148 / #171）", () => {
  beforeEach(() => {
    createServerSupabase.mockReset();
    getAuthorizedViewer.mockReset();
    getAuthorizedViewer.mockResolvedValue({ profileInfo: { id: 1 } });
  });

  const setupRpc = (error: { message: string; code?: string } | null) => {
    createServerSupabase.mockReturnValue({
      rpc: () => ({
        single: () =>
          Promise.resolve({
            data: error
              ? null
              : { deleted: false, source_amount: 1000, adjustment_amount: 200 },
            error,
          }),
      }),
    });
  };

  it("DB 関数の先頭の判定・保存の途中の確定（書き込みのトリガー）の MONTH_CLOSED を確定済みのエラーにする", async () => {
    // 関数の先頭の判定は message のみ、トリガーは SQLSTATE 42501 付き
    for (const error of [
      { message: "MONTH_CLOSED" },
      { message: "MONTH_CLOSED", code: "42501" },
    ]) {
      setupRpc(error);
      const result = await saveProfitLossAdjustment(
        { targetType: "recurring_cost", recurringCostId: 1 },
        "2026-09",
        1200,
        "値上げ",
      );
      expect(result.error).toEqual({
        kind: "validationFailed",
        message: expect.stringContaining(CLOSED_MESSAGE),
      });
    }
  });

  it("保存できた場合は調整額を返す", async () => {
    setupRpc(null);
    const result = await saveProfitLossAdjustment(
      { targetType: "recurring_cost", recurringCostId: 1 },
      "2026-09",
      1200,
      "値上げ",
    );
    expect(result).toEqual({ deleted: false, adjustmentAmount: 200 });
  });
});

describe("deleteProfitLossAdjustment の確定済みの月（Issue #148 / #171）", () => {
  beforeEach(() => {
    createServerSupabase.mockReset();
    getAuthorizedViewer.mockReset();
    getAuthorizedViewer.mockResolvedValue({ profileInfo: { id: 1 } });
  });

  const setupDelete = (
    data: { id: number }[] | null,
    error: { message: string; code?: string } | null,
  ) => {
    const query = {
      delete: () => query,
      eq: () => query,
      select: () => Promise.resolve({ data, error }),
    };
    createServerSupabase.mockReturnValue({ from: () => query });
  };

  it("削除できた場合は成功を返す", async () => {
    setupDelete([{ id: 3 }], null);
    expect(await deleteProfitLossAdjustment(3)).toEqual({});
  });

  it("確定済みの月（RLS で 0 行）は確定済みのエラーを返す", async () => {
    setupDelete([], null);
    const result = await deleteProfitLossAdjustment(3);
    expect(result.error?.kind).toBe("validationFailed");
    expect(result.error?.message).toContain(CLOSED_MESSAGE);
  });

  it("削除の途中で同じ月が確定された（書き込みのトリガーの MONTH_CLOSED）場合も確定済みのエラーを返す", async () => {
    setupDelete(null, { message: "MONTH_CLOSED", code: "42501" });
    const result = await deleteProfitLossAdjustment(3);
    expect(result.error).toEqual({
      kind: "validationFailed",
      message: expect.stringContaining(CLOSED_MESSAGE),
    });
  });

  it("それ以外の失敗は取得失敗として返す", async () => {
    setupDelete(null, { message: "boom" });
    const result = await deleteProfitLossAdjustment(3);
    expect(result.error).toEqual({
      kind: "fetchFailed",
      message: "損益調整の削除に失敗しました。",
    });
  });
});
