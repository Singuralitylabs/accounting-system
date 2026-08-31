import { describe, expect, it } from "vitest";
import {
  BUDGET_DECLARATION_DEADLINE_DAY,
  DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS,
  buildBudgetDeclarationReminderMessage,
  canManageBudgetDeclarationReminderSettings,
  groupSlackIdsByTeam,
  isBudgetDeclarationReminderTargetDay,
  isValidBudgetDeclarationReminderTargetDay,
  normalizeBudgetDeclarationReminderTargetDays,
  undeclaredBudgetTeams,
} from "@/app/utils/budgetDeclarationReminder";

// vitest.config.ts で TZ=Asia/Tokyo に固定している（JST 前提のアプリのため）

describe("isBudgetDeclarationReminderTargetDay", () => {
  it.each(DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS)(
    "JST %d日は対象日である",
    (day) => {
      const dateString = `2026-09-${String(day).padStart(2, "0")}T03:00:00Z`; // JST 12:00
      expect(
        isBudgetDeclarationReminderTargetDay(
          new Date(dateString),
          DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS,
        ),
      ).toBe(true);
    },
  );

  it("対象日以外は false", () => {
    expect(
      isBudgetDeclarationReminderTargetDay(
        new Date("2026-09-16T03:00:00Z"),
        DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS,
      ),
    ).toBe(false);
  });

  it("UTC 深夜は JST 日付にシフトして判定する", () => {
    // 2026-09-14T15:00:00Z = 2026-09-15T00:00 JST（対象日）
    expect(
      isBudgetDeclarationReminderTargetDay(
        new Date("2026-09-14T15:00:00Z"),
        DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS,
      ),
    ).toBe(true);
    // 2026-09-19T15:00:00Z = 2026-09-20T00:00 JST（対象日）
    expect(
      isBudgetDeclarationReminderTargetDay(
        new Date("2026-09-19T15:00:00Z"),
        DEFAULT_BUDGET_DECLARATION_REMINDER_TARGET_DAYS,
      ),
    ).toBe(true);
  });

  it("対象日リストが空なら常に false（リマインド停止。Issue #94）", () => {
    expect(
      isBudgetDeclarationReminderTargetDay(
        new Date("2026-09-20T03:00:00Z"),
        [],
      ),
    ).toBe(false);
  });
});

describe("undeclaredBudgetTeams", () => {
  it("申告済みチームを除いた未申告チームだけを返す", () => {
    expect(
      undeclaredBudgetTeams(
        ["営業チーム", "開発チーム", "広報チーム"],
        ["開発チーム"],
      ),
    ).toEqual(["営業チーム", "広報チーム"]);
  });

  it("全チーム申告済みなら空配列", () => {
    expect(undeclaredBudgetTeams(["営業チーム"], ["営業チーム"])).toEqual([]);
  });

  it("誰も申告していなければ全チームを返す", () => {
    expect(undeclaredBudgetTeams(["営業チーム", "開発チーム"], [])).toEqual([
      "営業チーム",
      "開発チーム",
    ]);
  });
});

describe("groupSlackIdsByTeam", () => {
  it("slack_id 設定済みのリーダーだけをチームごとにまとめる", () => {
    const result = groupSlackIdsByTeam(
      ["営業チーム", "開発チーム", "広報チーム"],
      [
        { team: "営業チーム", slack_id: "U001" },
        { team: "営業チーム", slack_id: "U002" },
        { team: "開発チーム", slack_id: null },
      ],
    );

    expect(result.get("営業チーム")).toEqual(["U001", "U002"]);
    expect(result.get("開発チーム")).toEqual([]);
    // リーダー不在チーム（leaderRows に行が無い）も空配列で含まれる
    expect(result.get("広報チーム")).toEqual([]);
  });
});

describe("buildBudgetDeclarationReminderMessage", () => {
  const url = "https://example.com/budget-declarations";

  it("未申告チームが 0 件なら null を返す（申告済みチームには通知しない）", () => {
    expect(
      buildBudgetDeclarationReminderMessage([], "2026-10", url),
    ).toBeNull();
  });

  it("slack_id 設定済みのチームはメンション付きで表示する", () => {
    const message = buildBudgetDeclarationReminderMessage(
      [{ team: "営業チーム", slackIds: ["U001"] }],
      "2026-10",
      url,
    );

    expect(message).toContain("<@U001> 営業チーム");
    expect(message).toContain("2026年10月");
    expect(message).toContain(`期限: 毎月${BUDGET_DECLARATION_DEADLINE_DAY}日`);
    expect(message).toContain(url);
  });

  it("複数リーダーは全員分メンションする", () => {
    const message = buildBudgetDeclarationReminderMessage(
      [{ team: "営業チーム", slackIds: ["U001", "U002"] }],
      "2026-10",
      url,
    );

    expect(message).toContain("<@U001> <@U002> 営業チーム");
  });

  it("slack_id 未設定・リーダー不在チームはメンションなしでチーム名のみ表示する", () => {
    const message = buildBudgetDeclarationReminderMessage(
      [{ team: "広報チーム", slackIds: [] }],
      "2026-10",
      url,
    );

    expect(message).toContain("- 広報チーム");
    expect(message).not.toContain("<@");
  });
});

describe("isValidBudgetDeclarationReminderTargetDay", () => {
  it.each([1, 15, 31])("%d は有効な対象日である", (day) => {
    expect(isValidBudgetDeclarationReminderTargetDay(day)).toBe(true);
  });

  it.each([0, 32, -1, 1.5, NaN])("%d は無効な対象日である", (day) => {
    expect(isValidBudgetDeclarationReminderTargetDay(day)).toBe(false);
  });
});

describe("normalizeBudgetDeclarationReminderTargetDays", () => {
  it("範囲外の値を除外し、重複を排除して昇順ソートする", () => {
    expect(
      normalizeBudgetDeclarationReminderTargetDays([20, 0, 15, 20, 32, 5]),
    ).toEqual([5, 15, 20]);
  });

  it("空配列はそのまま空配列を返す（リマインド停止）", () => {
    expect(normalizeBudgetDeclarationReminderTargetDays([])).toEqual([]);
  });

  it("全て無効な値なら空配列を返す", () => {
    expect(normalizeBudgetDeclarationReminderTargetDays([0, 32, -5])).toEqual(
      [],
    );
  });
});

describe("canManageBudgetDeclarationReminderSettings", () => {
  it.each(["admin", "accounting"])(
    "%s はリマインド設定を編集できる",
    (profileClass) => {
      expect(canManageBudgetDeclarationReminderSettings(profileClass)).toBe(
        true,
      );
    },
  );

  it.each(["teamleader", "public", null, undefined])(
    "%s はリマインド設定を編集できない",
    (profileClass) => {
      expect(canManageBudgetDeclarationReminderSettings(profileClass)).toBe(
        false,
      );
    },
  );
});
