import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, getAuthorizedViewer } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  getAuthorizedViewer: vi.fn(),
}));

vi.mock("@/app/utils/supabase/clients", () => ({ createServerSupabase }));
vi.mock("@/app/utils/supabase/viewerAccess", () => ({ getAuthorizedViewer }));

import {
  getBudgetDeclarationReminderSettings,
  updateBudgetDeclarationReminderDays,
} from "@/app/utils/supabase/budgetDeclarationReminderSettings";

describe("getBudgetDeclarationReminderSettings", () => {
  const order = vi.fn();
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));

  beforeEach(() => {
    order.mockReset();
    select.mockClear();
    from.mockClear();
    createServerSupabase.mockReturnValue({ from });
    getAuthorizedViewer.mockReset();
    getAuthorizedViewer.mockResolvedValue({
      profileInfo: { id: 1, class: "admin" },
    });
  });

  it("admin / accounting は現在の対象日と文面を取得できる", async () => {
    const rows = [{ day: 15, message: "予告" }];
    order.mockResolvedValue({ data: rows, error: null });

    const result = await getBudgetDeclarationReminderSettings();

    expect(from).toHaveBeenCalledWith("budget_declaration_reminder_days");
    expect(result).toEqual({ days: rows });
  });

  it("権限不足のときは取得せずエラーを返す", async () => {
    getAuthorizedViewer.mockResolvedValue({
      error: { kind: "forbidden", message: "権限がありません。" },
    });

    const result = await getBudgetDeclarationReminderSettings();

    expect(from).not.toHaveBeenCalled();
    expect(result.error?.kind).toBe("forbidden");
  });

  it("DB エラー時はエラーを返す（cron 用と異なりデフォルト値へフォールバックしない）", async () => {
    order.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });

    const result = await getBudgetDeclarationReminderSettings();

    expect(result.error?.kind).toBe("fetchFailed");
  });
});

describe("updateBudgetDeclarationReminderDays", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    rpc.mockReset();
    createServerSupabase.mockReturnValue({ rpc });
    getAuthorizedViewer.mockReset();
    getAuthorizedViewer.mockResolvedValue({
      profileInfo: { id: 1, class: "accounting" },
    });
  });

  it("正規化した行を全置換 RPC に渡す（範囲外は除外・重複は後勝ち・日付昇順）", async () => {
    rpc.mockResolvedValue({ error: null });

    const result = await updateBudgetDeclarationReminderDays([
      { day: 20, message: "{month}期限" },
      { day: 15, message: "a" },
      { day: 15, message: "b" },
      { day: 0, message: "x" },
      { day: 32, message: "x" },
    ]);

    expect(rpc).toHaveBeenCalledWith("replace_budget_declaration_reminder_days", {
      p_rows: [
        { day: 15, message: "b" },
        { day: 20, message: "{month}期限" },
      ],
    });
    expect(result).toEqual({});
  });

  it("空配列で保存するとそのまま空配列で置換する（リマインド停止）", async () => {
    rpc.mockResolvedValue({ error: null });

    await updateBudgetDeclarationReminderDays([]);

    expect(rpc).toHaveBeenCalledWith("replace_budget_declaration_reminder_days", {
      p_rows: [],
    });
  });

  it("権限不足のときは更新せずエラーを返す", async () => {
    getAuthorizedViewer.mockResolvedValue({
      error: { kind: "forbidden", message: "権限がありません。" },
    });

    const result = await updateBudgetDeclarationReminderDays([
      { day: 15, message: "a" },
    ]);

    expect(rpc).not.toHaveBeenCalled();
    expect(result.error?.kind).toBe("forbidden");
  });

  it("未知のプレースホルダ・空の文面は更新せずエラーを返す", async () => {
    const unknown = await updateBudgetDeclarationReminderDays([
      { day: 15, message: "{foo}" },
    ]);
    const empty = await updateBudgetDeclarationReminderDays([
      { day: 20, message: " " },
    ]);

    expect(rpc).not.toHaveBeenCalled();
    expect(unknown.error?.message).toContain("15日");
    expect(empty.error?.message).toContain("20日");
  });

  it("RPC エラー時はエラーを返す", async () => {
    rpc.mockResolvedValue({ error: { message: "boom" } });

    const result = await updateBudgetDeclarationReminderDays([
      { day: 15, message: "a" },
    ]);

    expect(result.error?.kind).toBe("fetchFailed");
  });
});
