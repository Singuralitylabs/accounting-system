import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({
  getBudgetDeclarationReminderDays: vi.fn(),
  getActiveBudgetTeams: vi.fn(),
  getDeclaredBudgetTeams: vi.fn(),
  getTeamLeaderSlackContacts: vi.fn(),
  isBudgetMonthClosed: vi.fn(),
}));
const { sendBudgetDeclarationReminderToSlack } = vi.hoisted(() => ({
  sendBudgetDeclarationReminderToSlack: vi.fn(),
}));

vi.mock("@/app/utils/supabase/budgetDeclarationReminderData", () => data);
vi.mock("@/app/utils/slack/sendBudgetDeclarationReminder", () => ({
  sendBudgetDeclarationReminderToSlack,
}));

import { GET } from "@/app/api/cron/budget-declaration-reminder/route";

const request = () =>
  new NextRequest("http://localhost/api/cron/budget-declaration-reminder", {
    headers: { authorization: "Bearer secret" },
  });

describe("GET /api/cron/budget-declaration-reminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // 2026-09-15 12:00 JST: the target month is October.
    vi.setSystemTime(new Date("2026-09-15T03:00:00Z"));
    process.env.CRON_SECRET = "secret";
    data.getBudgetDeclarationReminderDays.mockResolvedValue([
      {
        day: 15,
        message: "【予告】{month}分を{deadline}日までに申告してください",
      },
      { day: 20, message: "【本日期限】{month}分" },
    ]);
    data.getActiveBudgetTeams.mockResolvedValue({
      teams: ["Aチーム", "Bチーム"],
      error: null,
    });
    data.getDeclaredBudgetTeams.mockResolvedValue({
      teams: ["Bチーム"],
      error: null,
    });
    data.isBudgetMonthClosed.mockResolvedValue({ closed: false, error: null });
    data.getTeamLeaderSlackContacts.mockResolvedValue({
      contacts: [{ team: "Aチーム", slack_id: "U001" }],
      error: null,
    });
    sendBudgetDeclarationReminderToSlack.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("当日の行の文面を展開し、未申告チーム（リーダーのメンション）と期限・URL を後ろに付けて送る", async () => {
    const response = await GET(request());

    expect(await response.json()).toEqual({ notifiedTeams: ["Aチーム"] });
    const text = sendBudgetDeclarationReminderToSlack.mock
      .calls[0][0] as string;
    const lines = text.split("\n");
    expect(lines[0]).toBe("【予告】2026年10月分を20日までに申告してください");
    expect(lines).toContain("- <@U001> Aチーム");
    expect(text).toContain("期限: 毎月20日");
    expect(text).toContain("/budget-declarations");
  });

  it("別の対象日では、その日の文面で送る", async () => {
    vi.setSystemTime(new Date("2026-09-20T03:00:00Z"));

    await GET(request());

    const text = sendBudgetDeclarationReminderToSlack.mock
      .calls[0][0] as string;
    expect(text.split("\n")[0]).toBe("【本日期限】2026年10月分");
  });

  it("当日の行が無ければ not-target-day でスキップする", async () => {
    vi.setSystemTime(new Date("2026-09-16T03:00:00Z"));

    const response = await GET(request());

    expect(await response.json()).toEqual({
      skipped: true,
      reason: "not-target-day",
    });
    expect(sendBudgetDeclarationReminderToSlack).not.toHaveBeenCalled();
  });

  it("行が 0 件ならリマインドを送らない", async () => {
    data.getBudgetDeclarationReminderDays.mockResolvedValue([]);

    const response = await GET(request());

    expect((await response.json()).reason).toBe("not-target-day");
    expect(sendBudgetDeclarationReminderToSlack).not.toHaveBeenCalled();
  });

  it("CRON_SECRET が一致しなければ 401", async () => {
    const response = await GET(
      new NextRequest("http://localhost/x", {
        headers: { authorization: "Bearer wrong" },
      }),
    );

    expect(response.status).toBe(401);
  });
});
