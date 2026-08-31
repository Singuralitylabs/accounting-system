import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, getAuthorizedViewer } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  getAuthorizedViewer: vi.fn(),
}));

vi.mock("@/app/utils/supabase/clients", () => ({ createServerSupabase }));
vi.mock("@/app/utils/supabase/viewerAccess", () => ({ getAuthorizedViewer }));

import {
  getBudgetDeclarationReminderSettings,
  updateBudgetDeclarationReminderTargetDays,
} from "@/app/utils/supabase/budgetDeclarationReminderSettings";

describe("getBudgetDeclarationReminderSettings", () => {
  const maybeSingle = vi.fn();
  const select = vi.fn(() => ({ maybeSingle }));
  const from = vi.fn(() => ({ select }));

  beforeEach(() => {
    maybeSingle.mockReset();
    select.mockClear();
    from.mockClear();
    createServerSupabase.mockReturnValue({ from });
    getAuthorizedViewer.mockReset();
    getAuthorizedViewer.mockResolvedValue({
      profileInfo: { id: 1, class: "admin" },
    });
  });

  it("admin / accounting は現在の対象日を取得できる", async () => {
    maybeSingle.mockResolvedValue({
      data: { target_days: [15, 18, 20] },
      error: null,
    });

    const result = await getBudgetDeclarationReminderSettings();

    expect(from).toHaveBeenCalledWith("budget_declaration_reminder_settings");
    expect(result).toEqual({ targetDays: [15, 18, 20] });
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
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });

    const result = await getBudgetDeclarationReminderSettings();

    expect(result.error?.kind).toBe("fetchFailed");
  });
});

describe("updateBudgetDeclarationReminderTargetDays", () => {
  const select = vi.fn();
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));

  beforeEach(() => {
    select.mockReset();
    eq.mockClear();
    update.mockClear();
    from.mockClear();
    createServerSupabase.mockReturnValue({ from });
    getAuthorizedViewer.mockReset();
    getAuthorizedViewer.mockResolvedValue({
      profileInfo: { id: 1, class: "accounting" },
    });
  });

  it("正規化した対象日で id = 1 の行だけを更新する", async () => {
    select.mockResolvedValue({ data: [{ id: 1 }], error: null });

    const result = await updateBudgetDeclarationReminderTargetDays([
      20, 15, 15, 0, 32,
    ]);

    expect(from).toHaveBeenCalledWith("budget_declaration_reminder_settings");
    expect(update).toHaveBeenCalledWith({ target_days: [15, 20] });
    expect(eq).toHaveBeenCalledWith("id", 1);
    expect(result).toEqual({});
  });

  it("空配列で保存するとそのまま空配列で更新する（リマインド停止）", async () => {
    select.mockResolvedValue({ data: [{ id: 1 }], error: null });

    await updateBudgetDeclarationReminderTargetDays([]);

    expect(update).toHaveBeenCalledWith({ target_days: [] });
  });

  it("権限不足のときは更新せずエラーを返す", async () => {
    getAuthorizedViewer.mockResolvedValue({
      error: { kind: "forbidden", message: "権限がありません。" },
    });

    const result = await updateBudgetDeclarationReminderTargetDays([15]);

    expect(from).not.toHaveBeenCalled();
    expect(result.error?.kind).toBe("forbidden");
  });

  it("RLS で 0 行のとき（更新対象が見つからない）はエラーを返す", async () => {
    select.mockResolvedValue({ data: [], error: null });

    const result = await updateBudgetDeclarationReminderTargetDays([15]);

    expect(result.error?.kind).toBe("fetchFailed");
  });

  it("DB エラー時はエラーを返す", async () => {
    select.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await updateBudgetDeclarationReminderTargetDays([15]);

    expect(result.error?.kind).toBe("fetchFailed");
  });
});
