import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServiceRoleSupabase } = vi.hoisted(() => ({
  createServiceRoleSupabase: vi.fn(),
}));

vi.mock("@/app/utils/supabase/clients", () => ({
  createServiceRoleSupabase,
}));

import { DEFAULT_BUDGET_DECLARATION_REMINDER_DAYS } from "@/app/utils/budgetDeclarationReminder";
import {
  getBudgetDeclarationReminderDays,
  getDeclaredBudgetTeams,
  isBudgetMonthClosed,
} from "@/app/utils/supabase/budgetDeclarationReminderData";

describe("getBudgetDeclarationReminderDays", () => {
  const order = vi.fn();
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));

  beforeEach(() => {
    order.mockReset();
    select.mockClear();
    from.mockClear();
    createServiceRoleSupabase.mockReset();
    createServiceRoleSupabase.mockReturnValue({ from });
  });

  it("DB の対象日と日ごとの文面を返す", async () => {
    const rows = [
      { day: 10, message: "予告" },
      { day: 25, message: "本日期限" },
    ];
    order.mockResolvedValue({ data: rows, error: null });

    const result = await getBudgetDeclarationReminderDays();

    expect(from).toHaveBeenCalledWith("budget_declaration_reminder_days");
    expect(result).toEqual(rows);
  });

  it("行が 0 件ならそのまま空配列を返す（リマインド停止）", async () => {
    order.mockResolvedValue({ data: [], error: null });

    expect(await getBudgetDeclarationReminderDays()).toEqual([]);
  });

  it("DB エラー時はデフォルト値にフォールバックする", async () => {
    order.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });

    expect(await getBudgetDeclarationReminderDays()).toEqual(
      DEFAULT_BUDGET_DECLARATION_REMINDER_DAYS,
    );
  });

  it("createServiceRoleSupabase が例外を投げた場合もデフォルト値にフォールバックする（環境変数未設定など）", async () => {
    createServiceRoleSupabase.mockImplementation(() => {
      throw new Error("supabaseUrl is required.");
    });

    expect(await getBudgetDeclarationReminderDays()).toEqual(
      DEFAULT_BUDGET_DECLARATION_REMINDER_DAYS,
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

describe("getDeclaredBudgetTeams", () => {
  const not = vi.fn();
  const eq = vi.fn(() => ({ not }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  beforeEach(() => {
    not.mockReset();
    from.mockClear();
    eq.mockClear();
    createServiceRoleSupabase.mockReset();
    createServiceRoleSupabase.mockReturnValue({ from });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("完了済み（completed_at あり）の申告だけを申告済みチームとして返す（入力中はリマインド対象に残る）", async () => {
    not.mockResolvedValue({ data: [{ team: "Aチーム" }], error: null });

    expect(await getDeclaredBudgetTeams("2026-10-01")).toEqual({
      teams: ["Aチーム"],
      error: null,
    });
    expect(from).toHaveBeenCalledWith("budget_declarations");
    expect(eq).toHaveBeenCalledWith("target_month", "2026-10-01");
    expect(not).toHaveBeenCalledWith("completed_at", "is", null);
  });

  it("DB エラーはエラーとして返す（呼び出し側で 500 にする）", async () => {
    const error = { message: "boom" };
    not.mockResolvedValue({ data: null, error });

    expect(await getDeclaredBudgetTeams("2026-10-01")).toEqual({
      teams: [],
      error,
    });
  });
});
