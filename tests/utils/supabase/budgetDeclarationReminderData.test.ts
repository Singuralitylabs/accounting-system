import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServiceRoleSupabase } = vi.hoisted(() => ({
  createServiceRoleSupabase: vi.fn(),
}));

vi.mock("@/app/utils/supabase/clients", () => ({
  createServiceRoleSupabase,
}));

import { DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS } from "@/app/utils/budgetDeclarationReminder";
import { getBudgetDeclarationReminderTargetDays } from "@/app/utils/supabase/budgetDeclarationReminderData";

// Issue #94 の受け入れ基準（DB 取得失敗時もフォールバックにより従来どおり動作する）を
// 直接検証する。取得成功時は DB 値、失敗・行なしはデフォルト値にフォールバックすること。
describe("getBudgetDeclarationReminderTargetDays", () => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  beforeEach(() => {
    maybeSingle.mockReset();
    eq.mockClear();
    select.mockClear();
    from.mockClear();
    createServiceRoleSupabase.mockReturnValue({ from });
  });

  it("設定行を取得できたら DB の対象日を返す", async () => {
    maybeSingle.mockResolvedValue({
      data: { target_days: [10, 25] },
      error: null,
    });

    const result = await getBudgetDeclarationReminderTargetDays();

    expect(from).toHaveBeenCalledWith("budget_declaration_reminder_settings");
    expect(eq).toHaveBeenCalledWith("id", 1);
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
});
