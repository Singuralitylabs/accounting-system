import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServiceRoleSupabase } = vi.hoisted(() => ({
  createServiceRoleSupabase: vi.fn(),
}));

vi.mock("@/app/utils/supabase/clients", () => ({
  createServiceRoleSupabase,
}));

import { DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS } from "@/app/utils/budgetDeclarationReminder";
import {
  getBudgetDeclarationReminderTargetDays,
  isBudgetMonthClosed,
} from "@/app/utils/supabase/budgetDeclarationReminderData";

describe("getBudgetDeclarationReminderTargetDays", () => {
  const maybeSingle = vi.fn();
  const select = vi.fn(() => ({ maybeSingle }));
  const from = vi.fn(() => ({ select }));

  beforeEach(() => {
    maybeSingle.mockReset();
    select.mockClear();
    from.mockClear();
    createServiceRoleSupabase.mockReset();
    createServiceRoleSupabase.mockReturnValue({ from });
  });

  it("設定行を取得できたら DB の対象日を返す", async () => {
    maybeSingle.mockResolvedValue({
      data: { target_days: [10, 25] },
      error: null,
    });

    const result = await getBudgetDeclarationReminderTargetDays();

    expect(from).toHaveBeenCalledWith("budget_declaration_reminder_settings");
    expect(result).toEqual([10, 25]);
  });

  it("対象日を空配列にした設定はそのまま空配列を返す（リマインド停止）", async () => {
    maybeSingle.mockResolvedValue({ data: { target_days: [] }, error: null });

    expect(await getBudgetDeclarationReminderTargetDays()).toEqual([]);
  });

  it("DB エラー時はデフォルト値にフォールバックする", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });

    expect(await getBudgetDeclarationReminderTargetDays()).toEqual(
      DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS,
    );
  });

  it("設定行が存在しない場合もデフォルト値にフォールバックする", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await getBudgetDeclarationReminderTargetDays()).toEqual(
      DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS,
    );
  });

  it("createServiceRoleSupabase が例外を投げた場合もデフォルト値にフォールバックする（環境変数未設定など）", async () => {
    createServiceRoleSupabase.mockImplementation(() => {
      throw new Error("supabaseUrl is required.");
    });

    expect(await getBudgetDeclarationReminderTargetDays()).toEqual(
      DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS,
    );
  });
});

describe("isBudgetMonthClosed", () => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  beforeEach(() => {
    maybeSingle.mockReset();
    from.mockClear();
    eq.mockClear();
    createServiceRoleSupabase.mockReset();
    createServiceRoleSupabase.mockReturnValue({ from });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("確定行があれば closed: true（リマインドを送らない判定）", async () => {
    maybeSingle.mockResolvedValue({ data: { id: 1 }, error: null });

    expect(await isBudgetMonthClosed("2026-10-01")).toEqual({
      closed: true,
      error: null,
    });
    expect(from).toHaveBeenCalledWith("budget_declaration_closings");
    expect(eq).toHaveBeenCalledWith("target_month", "2026-10-01");
  });

  it("確定行が無ければ closed: false", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await isBudgetMonthClosed("2026-10-01")).toEqual({
      closed: false,
      error: null,
    });
  });

  it("DB エラーはエラーとして返す（呼び出し側で 500 にする）", async () => {
    const dbError = { message: "boom" };
    maybeSingle.mockResolvedValue({ data: null, error: dbError });

    expect(await isBudgetMonthClosed("2026-10-01")).toEqual({
      closed: false,
      error: dbError,
    });
  });
});
